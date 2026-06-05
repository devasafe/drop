import { Response } from 'express';
import User from '../models/User';
import { AuthenticatedRequest } from '../types';

// Adiciona um novo endereço ao usuário autenticado
export const addAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const {
      label, street, number, neighborhood, city, state, cep, latitude, longitude, setAsDefault
    } = req.body;
    if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
      return res.status(400).json({ error: 'Preencha todos os campos do endereço' });
    }
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    user.addresses = user.addresses || [];
    
    // ✅ DEBUG: Log antes de salvar
    console.log(`[ADDRESS] POST /addresses para usuário ${user.name}:`);
    console.log(`  - Endereços ANTES: ${user.addresses.length}`);
    console.log(`  - Novo endereço: ${street}, ${number} (setAsDefault=${setAsDefault})`);
    
    // ✅ Se setAsDefault, remover isDefault de todos os endereços
    if (setAsDefault) {
      user.addresses.forEach(addr => {
        addr.isDefault = false;
      });
    }
    
    // ✅ NOVO: Criar novo endereço com flag isDefault
    const newAddress = { 
      label, 
      street, 
      number, 
      neighborhood, 
      city, 
      state, 
      cep, 
      latitude, 
      longitude,
      isDefault: setAsDefault || false  // ✅ NOVO: Flag ao invés de mainAddress
    };
    user.addresses.push(newAddress);
    
    await user.save();
    
    // ✅ DEBUG: Log depois de salvar
    console.log(`  - Endereços DEPOIS: ${user.addresses.length}`);
    console.log(`  - Dados salvos:`, JSON.stringify(user.addresses, null, 2));
    
    return res.status(201).json(user.addresses);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao adicionar endereço' });
  }
};

// Define o endereço padrão do usuário
export const setDefaultAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { addressId } = req.body;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    user.addresses = user.addresses || [];
    
    // Procura o endereço pelo _id ou índice
    let targetAddr = null;
    let targetIdx = -1;
    
    if (addressId) {
      targetIdx = user.addresses.findIndex(addr => addr._id && String(addr._id) === String(addressId));
      if (targetIdx === -1 && !isNaN(Number(addressId))) {
        targetIdx = Number(addressId);
      }
      if (targetIdx >= 0 && targetIdx < user.addresses.length) {
        targetAddr = user.addresses[targetIdx];
      }
    }
    
    if (!targetAddr) return res.status(404).json({ error: 'Endereço não encontrado' });
    
    // ✅ NOVO: Remove isDefault de todos, marca apenas este como padrão
    user.addresses.forEach((addr, idx) => {
      addr.isDefault = (idx === targetIdx);
    });
    
    await user.save();
    return res.json({ addresses: user.addresses });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao definir endereço padrão' });
  }
};

// Edita um endereço pelo índice
export const editAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { index } = req.params;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    user.addresses = user.addresses || [];
    if (typeof index === 'undefined' || isNaN(Number(index)) || Number(index) < 0 || Number(index) >= user.addresses.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }
    const {
      label = '', street = '', number = '', neighborhood = '', city = '', state = '', cep = '', latitude = '', longitude = ''
    } = req.body;
    // Validação igual ao addAddress
    if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
      return res.status(400).json({ error: 'Preencha todos os campos do endereço' });
    }
    // ✅ NOVO: Preservar isDefault quando editar
    const wasDefault = user.addresses[Number(index)].isDefault;
    user.addresses[Number(index)] = { 
      label, 
      street, 
      number, 
      neighborhood, 
      city, 
      state, 
      cep, 
      latitude, 
      longitude,
      isDefault: wasDefault
    };
    await user.save();
    return res.json({ addresses: user.addresses });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao editar endereço' });
  }
};

// Lista todos os endereços do usuário autenticado
export const listAddresses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    
    // ✅ DEBUG: Log dos endereços
    console.log(`[ADDRESS] GET /addresses para usuário ${user.name} (${userId}):`);
    console.log(`  - Total de endereços no DB: ${(user.addresses || []).length}`);
    console.log(`  - Dados completos:`, JSON.stringify(user.addresses, null, 2));
    if (user.addresses && user.addresses.length > 0) {
      user.addresses.forEach((addr, idx) => {
        console.log(`  [${idx}] ${addr.label || 'Sem apelido'} - ${addr.street}, ${addr.number} (isDefault=${(addr as any).isDefault})`);
      });
    }
    
    return res.json(user.addresses || []);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao listar endereços' });
  }
};

// Remove um endereço pelo índice
export const removeAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { index } = req.params;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    user.addresses = user.addresses || [];
    if (typeof index === 'undefined' || isNaN(Number(index)) || Number(index) < 0 || Number(index) >= user.addresses.length) {
      return res.status(400).json({ error: 'Índice inválido' });
    }
    user.addresses.splice(Number(index), 1);
    await user.save();
    return res.json({ addresses: user.addresses });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    return res.status(500).json({ error: 'Erro ao remover endereço' });
  }
};
