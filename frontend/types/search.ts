import type { GeoPoint } from './delivery';

export interface SuggestProduct { id: string; name: string; image: string | null; price: number; oldPrice: number | null; storeId: string; storeName?: string }
export interface SuggestStore { id: string; name: string; slug: string }
export interface Suggestions { products: SuggestProduct[]; stores: SuggestStore[]; categories: string[] }
export type SearchType = 'products' | 'stores';
export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'distance';
export interface SearchFilters { sort: SearchSort; categoryName?: string; subCategory?: string; minPrice?: number; maxPrice?: number; openNow?: boolean }
export interface SearchQuery { q: string; type: SearchType; point: GeoPoint | null; filters: SearchFilters }
