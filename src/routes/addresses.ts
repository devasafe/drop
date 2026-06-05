import { Router } from 'express';
import { addAddress, listAddresses, removeAddress, editAddress, setDefaultAddress } from '../controllers/addressController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Adicionar novo endereço
router.post('/', authenticate, addAddress);

// Listar endereços
router.get('/', authenticate, listAddresses);

// Editar endereço por índice
router.put('/:index', authenticate, editAddress);

// Remover endereço por índice
router.delete('/:index', authenticate, removeAddress);

// Definir endereço padrão
router.post('/set-default', authenticate, setDefaultAddress);

export default router;
