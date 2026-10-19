export type Family = 'Floral' | 'Woody' | 'Fresh' | 'Amber'
export type BottleShape = 'square' | 'round' | 'slim'

export type Fragrance = {
  id: string
  name: string
  family: Family
  notes: string
  price: number
  size: string
  tag?: string
  glass: string
  liquid: string
  cap: string
  backdrop: string
  shape: BottleShape
  imageUrl?: string | null
  imagePath?: string | null
  isActive?: boolean
  soldOut?: boolean
}

export type ProductDraft = Omit<Fragrance, 'imageUrl' | 'imagePath'> & {
  imageUrl?: string | null
  imagePath?: string | null
}
