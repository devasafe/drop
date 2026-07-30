import { render, screen } from '@testing-library/react';
import { OrderTracker } from '../OrderTracker';
import { CategoryRail } from '../CategoryRail';
import { ShoppingBag } from 'lucide-react';
test('OrderTracker mostra loja e ETA', () => {
  render(<OrderTracker orderId="2481" storeName="TechStore" etaMin={12} progress={0.66} steps={[{label:'Confirmado',done:true},{label:'Saiu p/ entrega',done:true},{label:'Chegando',done:false}]} />);
  expect(screen.getByText(/TechStore/)).toBeInTheDocument();
  expect(screen.getByText('12 min')).toBeInTheDocument();
});
test('CategoryRail marca ativo e chama onSelect', () => {
  const onSelect = jest.fn();
  render(<CategoryRail categories={[{id:'todos',label:'Todos',icon:<ShoppingBag/>},{id:'elet',label:'Eletrônicos',icon:<ShoppingBag/>}]} activeId="todos" onSelect={onSelect} />);
  screen.getByText('Eletrônicos').click();
  expect(onSelect).toHaveBeenCalledWith('elet');
});
