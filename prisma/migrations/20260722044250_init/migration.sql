-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys', 'lojista', 'cliente', 'motoboy');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'blocked', 'inactive');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('user', 'store', 'platform', 'motoboy');

-- CreateEnum
CREATE TYPE "WalletEntryType" AS ENUM ('credit', 'debit', 'refund');

-- CreateEnum
CREATE TYPE "WalletEntryCategory" AS ENUM ('deposit', 'withdrawal', 'payment', 'refund', 'transfer', 'penalty');

-- CreateEnum
CREATE TYPE "StockType" AS ENUM ('internal', 'api');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('criado', 'pago', 'aguardando_motoboy', 'enviado', 'entregue', 'cancelado', 'rejeitado');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('credit_card', 'debit_card', 'pix', 'money', 'cash_on_delivery');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "AsaasChargeStatus" AS ENUM ('none', 'pending', 'received', 'confirmed', 'refunded', 'chargeback');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'assigned', 'picked', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('pending', 'aguardando_confirmacao', 'confirmado');

-- CreateEnum
CREATE TYPE "PendingReturnAction" AS ENUM ('reassign', 'cancel');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'released', 'requested', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "PayoutRecipientType" AS ENUM ('store', 'motoboy');

-- CreateEnum
CREATE TYPE "PayoutGatewayProvider" AS ENUM ('manual', 'asaas', 'pagarme', 'efi');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'paid', 'rejected');

-- CreateEnum
CREATE TYPE "WithdrawalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'processed');

-- CreateEnum
CREATE TYPE "CustomerDebtStatus" AS ENUM ('pending', 'collected');

-- CreateEnum
CREATE TYPE "AppCashboxEntryType" AS ENUM ('income', 'expense', 'withdrawal', 'deposit', 'refund');

-- CreateEnum
CREATE TYPE "AppCashboxSource" AS ENUM ('product_commission', 'delivery_commission', 'manual_deposit', 'manual_withdrawal', 'withdrawal_fee', 'cancelled_order', 'cancelled_delivery', 'coupon_discount', 'order_payment', 'order_refund', 'payout_paid', 'store_payout_reserved', 'motoboy_payout_reserved');

-- CreateEnum
CREATE TYPE "DeliveryInvoiceStatus" AS ENUM ('issued', 'cancelled');

-- CreateEnum
CREATE TYPE "WalletAccessStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('customer', 'motoboy', 'store', 'admin');

-- CreateEnum
CREATE TYPE "CancellationReasonCode" AS ENUM ('customer_request', 'not_available', 'store_closed', 'store_busy', 'motoboy_unavailable', 'delivery_failed', 'customer_unreachable', 'address_invalid', 'payment_issue', 'wrong_order', 'damaged_items', 'motoboy_rejected', 'store_rejected', 'late_cancellation', 'other');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('store', 'global');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('loja_cliente', 'loja_motoboy', 'motoboy_cliente', 'loja_cliente_pre_compra', 'suporte');

-- CreateEnum
CREATE TYPE "SupportCategory" AS ENUM ('clientes', 'lojistas', 'motoboys', 'geral');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('aberto', 'em_atendimento', 'resolvido');

-- CreateEnum
CREATE TYPE "ConversationContext" AS ENUM ('product', 'user');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read');

-- CreateEnum
CREATE TYPE "MessageSenderRole" AS ENUM ('loja', 'lojista', 'cliente', 'motoboy', 'suporte');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('system', 'broadcast', 'order', 'chat');

-- CreateEnum
CREATE TYPE "GamificationLevel" AS ENUM ('Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Lendario');

-- CreateEnum
CREATE TYPE "SeasonalTheme" AS ENUM ('none', 'natal', 'pascoa', 'junina', 'halloween');

-- CreateEnum
CREATE TYPE "StoreSubscriptionPlan" AS ENUM ('plan1', 'plan2', 'plan3');

-- CreateEnum
CREATE TYPE "PlanChangeStatus" AS ENUM ('none', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('whatsapp');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role",
    "roles" "Role"[] DEFAULT ARRAY['cliente']::"Role"[],
    "activeRole" "Role" NOT NULL DEFAULT 'cliente',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "blockedAt" TIMESTAMP(3),
    "blockedBy" TEXT,
    "blockReason" TEXT,
    "storeId" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telefone" TEXT,
    "cpf" TEXT,
    "rg" TEXT,
    "dataNascimento" TEXT,
    "sexo" TEXT,
    "photo" TEXT,
    "bankInfoEncrypted" TEXT,
    "bankInfo" JSONB,
    "planId" TEXT,
    "verification" JSONB,
    "asaas" JSONB,
    "currentLocation" JSONB,
    "isOnline" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "street" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "street" TEXT,
    "number" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "cnpj" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "stockType" "StockType" NOT NULL DEFAULT 'internal',
    "apiConfig" JSONB,
    "plan" INTEGER DEFAULT 1,
    "planSince" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "planExpiresAt" TIMESTAMP(3),
    "customCommissionRate" DECIMAL(5,2),
    "featuredBannerUrl" TEXT,
    "coverBannerUrl" TEXT,
    "operatingHours" JSONB,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verification" JSONB,
    "asaas" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "video" TEXT,
    "categoryId" TEXT,
    "subCategory" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "totalValue" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2),
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "deliveryDistance" DOUBLE PRECISION DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'criado',
    "paymentMethod" "PaymentMethod",
    "debtCollected" DECIMAL(12,2),
    "paymentStatus" "PaymentStatus" DEFAULT 'pending',
    "paymentId" TEXT,
    "asaasPaymentId" TEXT,
    "asaasChargeStatus" "AsaasChargeStatus" DEFAULT 'none',
    "walletApplied" DECIMAL(12,2) DEFAULT 0,
    "cancellationId" TEXT,
    "idempotentKey" TEXT,
    "customerAddress" TEXT,
    "customerLatitude" DOUBLE PRECISION,
    "customerLongitude" DOUBLE PRECISION,
    "storeAddress" TEXT,
    "storeLatitude" DOUBLE PRECISION,
    "storeLongitude" DOUBLE PRECISION,
    "routePolyline" TEXT,
    "routeWaypoints" JSONB,
    "walletDistribution" JSONB,
    "deliveryId" TEXT,
    "storeRating" INTEGER,
    "storeComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "ownerType" "OwnerType" NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "blockedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "availableBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFeeRate" DECIMAL(5,2),
    "gamificationBenefits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    "category" "WalletEntryCategory",
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "relatedId" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "motoboyId" TEXT,
    "distance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee" DECIMAL(12,2) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "pin" TEXT,
    "pinRetirada" TEXT,
    "pinDevolucao" TEXT,
    "statusDevolucao" "ReturnStatus" DEFAULT 'pending',
    "dataConfirmacaoDevolucao" TIMESTAMP(3),
    "pendingReturnAction" "PendingReturnAction",
    "rating" INTEGER,
    "comment" TEXT,
    "storeAddress" TEXT,
    "storeLatitude" DOUBLE PRECISION,
    "storeLongitude" DOUBLE PRECISION,
    "customerAddress" TEXT,
    "customerLatitude" DOUBLE PRECISION,
    "customerLongitude" DOUBLE PRECISION,
    "routePolyline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "commissionProduct" DECIMAL(12,2) NOT NULL,
    "commissionDelivery" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "recipientType" "PayoutRecipientType" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "releasedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "gatewayProvider" "PayoutGatewayProvider" NOT NULL DEFAULT 'manual',
    "gatewayTransferId" TEXT,
    "withdrawalRequestId" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "blockedAt" TIMESTAMP(3),
    "blockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "appCashboxId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "bankInfo" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "rejectionReason" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "motoboyId" TEXT NOT NULL,
    "motoboyName" TEXT NOT NULL,
    "motoboyEmail" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "WithdrawalRequestStatus" NOT NULL DEFAULT 'pending',
    "bankAccount" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "payoutIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDebt" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "collectedOrderId" TEXT,
    "status" "CustomerDebtStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppCashbox" (
    "id" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalIncome" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCashbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppCashboxEntry" (
    "id" TEXT NOT NULL,
    "appCashboxId" TEXT NOT NULL,
    "type" "AppCashboxEntryType" NOT NULL,
    "source" "AppCashboxSource" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "orderId" TEXT,
    "deliveryId" TEXT,
    "withdrawalId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppCashboxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payoutId" TEXT,
    "motoboyId" TEXT NOT NULL,
    "motoboyName" TEXT NOT NULL,
    "motoboyEmail" TEXT,
    "motoboyCpf" TEXT,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeAddress" TEXT,
    "storeCnpj" TEXT,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerAddress" TEXT,
    "serviceDescription" TEXT NOT NULL DEFAULT 'Servico de entrega rapida por motoboy',
    "distance" DOUBLE PRECISION,
    "deliveryFee" DECIMAL(12,2) NOT NULL,
    "motoboyAmount" DECIMAL(12,2) NOT NULL,
    "appCommission" DECIMAL(12,2) NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "pickedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DeliveryInvoiceStatus" NOT NULL DEFAULT 'issued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cancellation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryId" TEXT,
    "cancelledBy" "CancelledBy" NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonCode" "CancellationReasonCode" NOT NULL,
    "details" TEXT,
    "refundAmount" DECIMAL(12,2),
    "refundStatus" "RefundStatus" DEFAULT 'pending',
    "isLateCancellation" BOOLEAN NOT NULL DEFAULT false,
    "lateCancellationFee" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "discountType" "CouponDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "storeId" TEXT,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minOrderValue" DECIMAL(12,2),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccessRequest" (
    "id" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByRole" "Role" NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "WalletAccessStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "type" "ConversationKind" NOT NULL,
    "supportCategory" "SupportCategory",
    "supportStatus" "SupportStatus" DEFAULT 'aberto',
    "participant1" JSONB NOT NULL,
    "participant2" JSONB NOT NULL,
    "orderId" TEXT,
    "deliveryId" TEXT,
    "relatedOrderNumber" TEXT,
    "productId" TEXT,
    "conversationType" "ConversationContext" DEFAULT 'user',
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "unreadCount" INTEGER[] DEFAULT ARRAY[0, 0]::INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBlocked" BOOLEAN[] DEFAULT ARRAY[false, false]::BOOLEAN[],
    "isMuted" BOOLEAN[] DEFAULT ARRAY[false, false]::BOOLEAN[],
    "deletedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "MessageSenderRole" NOT NULL,
    "senderName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachments" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'sent',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "title" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'system',
    "broadcastId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gamification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "level" "GamificationLevel" NOT NULL DEFAULT 'Bronze',
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "history" JSONB,

    CONSTRAINT "Gamification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermissions" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notificationTargets" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "id" TEXT NOT NULL,
    "commissionPlan1" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "commissionPlan2" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "commissionPlan3" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "motoboyCutPerDelivery" DECIMAL(12,2) NOT NULL DEFAULT 5,
    "motoboyCutPerKm" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "motoboyMinimumWithdraw" DECIMAL(12,2) NOT NULL DEFAULT 50,
    "motoboyCommissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "lateCancellationFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "lateCancellationMotoboyShare" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "autoApprovePayouts" BOOLEAN NOT NULL DEFAULT false,
    "autoApproveWithdrawals" BOOLEAN NOT NULL DEFAULT false,
    "seasonalTheme" "SeasonalTheme" NOT NULL DEFAULT 'none',
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commission" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "motorcycleTaxes" JSONB NOT NULL,
    "minWithdraw" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSubscription" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "currentPlan" "StoreSubscriptionPlan" NOT NULL DEFAULT 'plan1',
    "requestedPlan" "StoreSubscriptionPlan",
    "planChangeStatus" "PlanChangeStatus" NOT NULL DEFAULT 'none',
    "requestedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "commissionRate" DECIMAL(5,2) DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "openedBy" JSONB NOT NULL,
    "assignedTo" JSONB,
    "category" "SupportCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "SupportStatus" NOT NULL DEFAULT 'aberto',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingPrize" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "prizes" JSONB NOT NULL,
    "distributed" BOOLEAN NOT NULL DEFAULT false,
    "distributedAt" TIMESTAMP(3),
    "distributedBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RankingPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL DEFAULT 'whatsapp',
    "e164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'asaas',
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "processError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_storeId_idx" ON "User"("storeId");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Store_ownerId_idx" ON "Store"("ownerId");

-- CreateIndex
CREATE INDEX "Store_plan_idx" ON "Store"("plan");

-- CreateIndex
CREATE INDEX "Store_isVerified_idx" ON "Store"("isVerified");

-- CreateIndex
CREATE INDEX "Category_storeId_idx" ON "Category"("storeId");

-- CreateIndex
CREATE INDEX "Product_storeId_idx" ON "Product"("storeId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotentKey_key" ON "Order"("idempotentKey");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_asaasPaymentId_idx" ON "Order"("asaasPaymentId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Wallet_owner_ownerType_idx" ON "Wallet"("owner", "ownerType");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_owner_ownerType_key" ON "Wallet"("owner", "ownerType");

-- CreateIndex
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletEntry_relatedId_idx" ON "WalletEntry"("relatedId");

-- CreateIndex
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_motoboyId_idx" ON "Delivery"("motoboyId");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "Transaction_orderId_idx" ON "Transaction"("orderId");

-- CreateIndex
CREATE INDEX "Payout_recipientType_recipientId_status_idx" ON "Payout"("recipientType", "recipientId", "status");

-- CreateIndex
CREATE INDEX "Payout_orderId_idx" ON "Payout"("orderId");

-- CreateIndex
CREATE INDEX "Payout_status_releasedAt_idx" ON "Payout"("status", "releasedAt");

-- CreateIndex
CREATE INDEX "Payout_withdrawalRequestId_idx" ON "Payout"("withdrawalRequestId");

-- CreateIndex
CREATE INDEX "Withdrawal_appCashboxId_status_idx" ON "Withdrawal"("appCashboxId", "status");

-- CreateIndex
CREATE INDEX "Withdrawal_requestedAt_idx" ON "Withdrawal"("requestedAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_motoboyId_idx" ON "WithdrawalRequest"("motoboyId");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_idx" ON "WithdrawalRequest"("status");

-- CreateIndex
CREATE INDEX "CustomerDebt_customerId_status_idx" ON "CustomerDebt"("customerId", "status");

-- CreateIndex
CREATE INDEX "AppCashboxEntry_appCashboxId_createdAt_idx" ON "AppCashboxEntry"("appCashboxId", "createdAt");

-- CreateIndex
CREATE INDEX "AppCashboxEntry_orderId_idx" ON "AppCashboxEntry"("orderId");

-- CreateIndex
CREATE INDEX "AppCashboxEntry_deliveryId_idx" ON "AppCashboxEntry"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryInvoice_invoiceNumber_key" ON "DeliveryInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "DeliveryInvoice_motoboyId_issuedAt_idx" ON "DeliveryInvoice"("motoboyId", "issuedAt");

-- CreateIndex
CREATE INDEX "DeliveryInvoice_orderId_idx" ON "DeliveryInvoice"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryInvoice_deliveryId_idx" ON "DeliveryInvoice"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryInvoice_storeId_issuedAt_idx" ON "DeliveryInvoice"("storeId", "issuedAt");

-- CreateIndex
CREATE INDEX "Cancellation_orderId_idx" ON "Cancellation"("orderId");

-- CreateIndex
CREATE INDEX "Cancellation_deliveryId_idx" ON "Cancellation"("deliveryId");

-- CreateIndex
CREATE INDEX "Cancellation_cancelledBy_idx" ON "Cancellation"("cancelledBy");

-- CreateIndex
CREATE INDEX "Cancellation_createdAt_idx" ON "Cancellation"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_storeId_isActive_idx" ON "Coupon"("storeId", "isActive");

-- CreateIndex
CREATE INDEX "Coupon_type_isActive_idx" ON "Coupon"("type", "isActive");

-- CreateIndex
CREATE INDEX "WalletAccessRequest_targetUserId_status_idx" ON "WalletAccessRequest"("targetUserId", "status");

-- CreateIndex
CREATE INDEX "WalletAccessRequest_requestedBy_createdAt_idx" ON "WalletAccessRequest"("requestedBy", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_orderId_type_idx" ON "Conversation"("orderId", "type");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_deliveryId_idx" ON "Conversation"("deliveryId");

-- CreateIndex
CREATE INDEX "Conversation_productId_idx" ON "Conversation"("productId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_status_idx" ON "Message"("conversationId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "Gamification_userId_key" ON "Gamification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermissions_role_key" ON "RolePermissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "PricingPlan_name_key" ON "PricingPlan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StoreSubscription_storeId_key" ON "StoreSubscription"("storeId");

-- CreateIndex
CREATE INDEX "SupportTicket_category_status_idx" ON "SupportTicket"("category", "status");

-- CreateIndex
CREATE INDEX "Broadcast_sentAt_idx" ON "Broadcast"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "RankingPrize_month_year_key" ON "RankingPrize"("month", "year");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_tokenHash_idx" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpCode_userId_idx" ON "OtpCode"("userId");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "WebhookEvent_provider_idx" ON "WebhookEvent"("provider");

-- CreateIndex
CREATE INDEX "WebhookEvent_event_idx" ON "WebhookEvent"("event");

-- CreateIndex
CREATE INDEX "WebhookEvent_processed_idx" ON "WebhookEvent"("processed");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Store" ADD CONSTRAINT "Store_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppCashboxEntry" ADD CONSTRAINT "AppCashboxEntry_appCashboxId_fkey" FOREIGN KEY ("appCashboxId") REFERENCES "AppCashbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
