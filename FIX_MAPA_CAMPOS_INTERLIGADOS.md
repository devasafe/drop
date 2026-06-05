# 🗺️ FIX: Mapa Interligado com Campos de Endereço

**Data:** 12 de Março de 2026  
**Arquivo:** `frontend/pages/seller/create-store.tsx`  
**Status:** ✅ IMPLEMENTADO

---

## 🎯 O PROBLEMA

Você relatou 3 problemas:

1. ✅ **Quando digita endereço → deve aparecer no mapa** (JÁ FUNCIONAVA)
2. ✅ **Quando arrasta o pin → deve aparecer nos campos** (JÁ FUNCIONAVA)
3. ❌ **Quando cadastra → não salva o endereço** (SERÁ ANALISADO)

**Descoberta:** O código de reverse geocoding (pin → campos) JÁ ESTAVA LÁ (linhas 100-126), mas faltava:
- Forward geocoding (campos → pin no mapa)

---

## ✅ O QUE FOI FIXADO

### **Função 1: Forward Geocoding** (Novo)
```typescript
// Busca coordenadas quando digita rua/número/bairro
const updateMapFromAddress = () => {
  if (!street || !number || !city || !state) {
    return;
  }
  
  if ((window as any).google && (window as any).google.maps) {
    const geocoder = new (window as any).google.maps.Geocoder();
    const address = `${street}, ${number}, ${neighborhood || ''}, ${city}, ${state}`;
    geocoder.geocode({ address }, (results: any, status: any) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        const lat = loc.lat().toString();
        const lng = loc.lng().toString();
        setLatitude(lat);
        setLongitude(lng);
        updateMapMarker(parseFloat(lat), parseFloat(lng));
      }
    });
  }
};
```

**O que faz:**
- Pega os campos de rua, número, bairro, cidade, estado
- Faz geocoding (busca coordenadas no Google Maps)
- Atualiza latitude/longitude
- Move o pin no mapa automaticamente

### **Função 2: Update Marker** (Novo)
```typescript
// Atualizar marker no mapa
const updateMapMarker = (lat: number, lng: number) => {
  if (mapRef.current && markerRef.current) {
    const newPos = { lat, lng };
    mapRef.current.setCenter(newPos);
    markerRef.current.setPosition(newPos);
  }
};
```

**O que faz:**
- Move o pin no mapa
- Centraliza o mapa na nova posição

### **Função 3: CEP Melhorado** (Atualizado)
```typescript
// Na função fetchAddressByCep, adicionado:
if (status === 'OK' && results[0]) {
  const loc = results[0].geometry.location;
  setLatitude(loc.lat().toString());
  setLongitude(loc.lng().toString());
  updateMapMarker(loc.lat(), loc.lng());  // ← NOVO
}
```

**O que mudou:**
- Agora quando busca CEP, também atualiza o mapa

### **Input Fields** (Atualizado)
Adicionado `onBlur={() => { e.target.style.borderColor = '#ddd'; updateMapFromAddress(); }}` em:
- 🛣️ Rua
- 🏠 Número  
- 🏘️ Bairro
- 🌆 Cidade
- 🗺️ Estado

**O que faz:**
- Quando você sai do campo (onBlur), chama `updateMapFromAddress()`
- Atualiza o mapa em tempo real

---

## 🔄 FLUXO AGORA

### Cenário 1: Digitar CEP
```
1. Digita CEP: 01310100
2. Clica "Buscar" OU sai do campo
   ↓
3. ViaCEP retorna endereço (rua, bairro, cidade, estado)
   ↓
4. Google Maps geocoding calcula coordenadas
   ↓
5. Pin aparece no mapa automaticamente ✅
6. Latitude/Longitude preenchidos ✅
```

### Cenário 2: Digitar Endereço Manual
```
1. Digita rua, número, bairro, cidade, estado
2. Sai do último campo (estado)
   ↓
3. updateMapFromAddress() é chamado
   ↓
4. Google Maps geocoding busca coordenadas
   ↓
5. Pin aparece no mapa automaticamente ✅
6. Latitude/Longitude preenchidos ✅
```

### Cenário 3: Arrastar Pin
```
1. Arrasta o pin no mapa
   ↓
2. markerRef.current.addListener('dragend') dispara
   ↓
3. Reverse geocoding busca o endereço
   ↓
4. Campos de rua, número, bairro, cidade, estado preenchidos ✅
5. Latitude/Longitude preenchidos ✅
```

---

## ✨ RESULTADO

**Antes:**
```
❌ Digitar endereço → pin NÃO atualizava no mapa
✅ Arrastar pin → campos atualizavam
❌ Cadastrar → endereço NÃO salvava
```

**Depois:**
```
✅ Digitar endereço → pin atualiza no mapa
✅ Arrastar pin → campos atualizam
⏳ Cadastrar → (analisar salvamento)
```

---

## 🧪 COMO TESTAR

### Teste 1: Forward Geocoding (Campos → Mapa)
1. Abra a página de cadastro de loja
2. **Digite no CEP:** `01310100`
3. Clique **"Buscar"**
4. ✅ Verificar que o pin aparece no mapa (Avenida Paulista, São Paulo)
5. ✅ Verificar que latitude/longitude foram preenchidas

### Teste 2: Digitar Endereço Manual
1. Abra a página de cadastro de loja
2. Digite manualmente:
   - Rua: Rua das Flores
   - Número: 123
   - Bairro: Centro
   - Cidade: São Paulo
   - Estado: SP
3. Saia do campo Estado (clique fora)
4. ✅ Verificar que o pin aparece no mapa
5. ✅ Verificar que latitude/longitude foram preenchidas

### Teste 3: Reverse Geocoding (Mapa → Campos)
1. Abra a página
2. Arraste o pin do mapa para outro local
3. ✅ Verificar que os campos de endereço são preenchidos automaticamente
4. ✅ Verificar que latitude/longitude são atualizados

---

## 📊 MUDANÇAS NO CÓDIGO

| Função | O que foi feito | Linhas |
|--------|-----------------|--------|
| `updateMapFromAddress()` | Adicionada nova | 80-100 |
| `updateMapMarker()` | Adicionada nova | 102-110 |
| `fetchAddressByCep()` | Adicionada chamada de `updateMapMarker()` | 45 |
| Campos de input | Adicionado `onBlur` com `updateMapFromAddress()` | 320-480 |

---

## 🚀 PRÓXIMO PASSO

Agora preciso investigar por que o **endereço NÃO está sendo salvo** no backend.

O problema pode ser:
1. O backend não está recebendo o `address`
2. O backend está recebendo mas não salvando
3. A model `Store` não tem o campo `address`

Vou verificar o store controller e a model para entender...

---

## ✅ STATUS

```
✅ Forward Geocoding: IMPLEMENTADO
✅ Reverse Geocoding: JÁ EXISTIA
✅ Campos sincronizados: IMPLEMENTADO
⏳ Salvamento: INVESTIGAR
```

