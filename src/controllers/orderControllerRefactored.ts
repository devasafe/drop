/**
 * Exemplo de refatoração do createOrder com Transações, Validação e Tratamento de Erros
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import Order from '../models/Order';
import Product from '../models/Product';
import Transaction from '../models/Transaction';
import Delivery from '../models/Delivery';
import notifier from '../services/notifier';
import { log } from '../config/logger';
import { validate } from '../middleware/validate';
import { CreateOrderSchema } from '../validation/schemas';
import {
  AppError,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
  AuthenticationError,
} from '../utils/AppError';
import mongoose from 'mongoose';
import {
  emitOrderCreated,
  emitOrderStatusChanged,
} from '../utils/socketEmitter';

// helper: calculate delivery fee (base 7 + 1 per km)
const calculateDeliveryFee = (distanceKm: number) => {
  const base = 7;
  const perKm = 1;
  return base + perKm * Math.max(0, distanceKm);
};

/**
 * ✅ NOVO: createOrder com Transações
 * - Validação robusta com Zod
 * - Transações Mongoose para atomicity
 * - Logging centralizado
 * - Tratamento de erros padronizado
 */
export const createOrderRefactored = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ Autenticação
    if (!req.user?.id) {
      throw new AuthenticationError('Usuário não autenticado');
    }

    // ✅ Validação com Zod (já feita por middleware)
    const { storeId, products, deliveryDistanceKm, paymentMethod } = req.body;

    log.operation('ORDER_CREATE', {
      userId: req.user.id,
      storeId,
      productCount: products.length,
    });

    // ============ VALIDAÇÃO DE DADOS ============
    if (!Array.isArray(products) || products.length === 0) {
      throw new ValidationError('Nenhum produto no pedido');
    }

    if (!storeId) {
      throw new ValidationError('Loja não informada');
    }

    // ============ PROCESSAR PRODUTOS E ESTOQUE ============
    let total = 0;
    const items = [];

    for (const p of products) {
      // Validação de cada produto
      if (!p.productId || !p.quantity || p.quantity <= 0) {
        throw new ValidationError(
          `Produto inválido: ${JSON.stringify(p)}`
        );
      }

      // ✅ Buscar produto com transação
      const prod = await Product.findById(p.productId).session(session);

      if (!prod) {
        throw new NotFoundError(`Produto ${p.productId}`);
      }

      if (prod.quantity < p.quantity) {
        throw new BusinessLogicError(
          `Estoque insuficiente para ${prod.name}. Disponível: ${prod.quantity}`
        );
      }

      // ✅ Usar preço do banco se não veio do carrinho
      let productPrice = p.price || prod.price;

      if (productPrice <= 0) {
        throw new BusinessLogicError(
          `Produto ${prod.name} com preço inválido (R$ ${productPrice})`
        );
      }

      // ✅ Decrementar estoque (dentro da transação)
      prod.quantity -= p.quantity;
      await prod.save({ session });

      const subtotal = productPrice * p.quantity;
      total += subtotal;

      items.push({
        productId: prod._id,
        quantity: p.quantity,
        price: productPrice,
      });

      log.debug('Product processed', {
        productId: prod._id,
        name: prod.name,
        quantity: p.quantity,
        price: productPrice,
        subtotal,
      });
    }

    if (total <= 0) {
      throw new BusinessLogicError(
        'Subtotal inválido (R$ 0.00). Verifique os produtos.'
      );
    }

    // ============ CALCULAR TOTAIS ============
    const deliveryFee = calculateDeliveryFee(Number(deliveryDistanceKm || 0));
    const totalValue = total + deliveryFee;

    log.debug('Order totals calculated', {
      subtotal: total,
      deliveryFee,
      totalValue,
    });

    // ============ CRIAR PEDIDO ============
    const order = new Order({
      customerId: req.user.id,
      storeId,
      products: items,
      totalValue,
      deliveryFee,
      status: 'criado',
    });

    await order.save({ session });

    // ============ PROCESSAR PAGAMENTO ============
    if (paymentMethod) {
      const commissionProduct = total * 0.1; // 10%
      const commissionDelivery = deliveryFee * 0.2; // 20%

      const transaction = new Transaction({
        orderId: order._id,
        paymentMethod,
        amount: totalValue,
        commissionProduct,
        commissionDelivery,
      });

      await transaction.save({ session });

      // ✅ Atualizar status do pedido (dentro da transação)
      order.status = 'pago';
      await order.save({ session });

      log.debug('Payment processed', {
        orderId: order._id,
        paymentMethod,
        amount: totalValue,
      });
    }

    // ✅ COMMIT da transação
    await session.commitTransaction();

    log.operationSuccess('ORDER_CREATE', {
      orderId: order._id,
      customerId: req.user.id,
      totalValue,
      status: order.status,
    });

    // ============ EMITIR EVENTOS SOCKET ============
    try {
      emitOrderCreated(order.toObject());
      if (order.status === 'pago') {
        emitOrderStatusChanged(order.toObject());
      }
    } catch (socketErr) {
      log.warn('Socket emit failed (non-blocking)', {
        orderId: order._id,
        error: socketErr instanceof Error ? socketErr.message : String(socketErr),
      });
    }

    // ============ RESPOSTA ============
    return res.status(201).json({
      success: true,
      data: {
        id: order._id,
        customerId: order.customerId,
        storeId: order.storeId,
        totalValue: order.totalValue,
        deliveryFee: order.deliveryFee,
        status: order.status,
        productsCount: order.products.length,
        createdAt: order.createdAt,
      },
    });
  } catch (err) {
    // ✅ Rollback automático em erro
    await session.abortTransaction();

    // ✅ Logging de erro
    if (err instanceof AppError) {
      log.operationError('ORDER_CREATE', err.message, {
        statusCode: err.statusCode,
        userId: req.user?.id,
      });

      return res.status(err.statusCode).json({
        success: false,
        error: {
          message: err.message,
          ...(err instanceof ValidationError && { errors: err.errors }),
        },
      });
    }

    // Erro desconhecido
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    log.error('ORDER_CREATE - Unexpected error', errorMsg, { userId: req.user?.id });

    return res.status(500).json({
      success: false,
      error: {
        message: 'Erro interno ao criar pedido',
      },
    });
  } finally {
    session.endSession();
  }
};

/**
 * Como usar no arquivo de rotas:
 *
 * router.post(
 *   '/',
 *   authenticate,
 *   validate(CreateOrderSchema, 'body'),
 *   createOrderRefactored
 * );
 */
