import { Router } from 'express';
import { listAllRoles, getRolePermissions, updateRolePermissions, resetRolePermissions } from '../controllers/rolePermissionsController';
import { authenticate, authorizeRoles } from '../middleware/auth';

const router = Router();

// Apenas CEO pode gerenciar permissões
router.get('/', authenticate, authorizeRoles('ceo'), listAllRoles);
router.get('/:role', authenticate, authorizeRoles('ceo'), getRolePermissions);
router.put('/:role', authenticate, authorizeRoles('ceo'), updateRolePermissions);
router.delete('/:role', authenticate, authorizeRoles('ceo'), resetRolePermissions);

export default router;
