import { pgTable, text, doublePrecision, boolean, timestamp } from 'drizzle-orm/pg-core'

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  family: text('family', { enum: ['Floral', 'Woody', 'Fresh', 'Amber'] }).notNull(),
  notes: text('notes').notNull().default(''),
  price: doublePrecision('price').notNull(),
  size: text('size').notNull().default('50 ml'),
  tag: text('tag'),
  glass: text('glass').notNull().default('#e8cfd2'),
  liquid: text('liquid').notNull().default('#b97880'),
  cap: text('cap').notNull().default('#6B1F3A'),
  backdrop: text('backdrop').notNull().default('#EDE3D7'),
  shape: text('shape', { enum: ['square', 'round', 'slim'] }).notNull().default('square'),
  imageUrl: text('image_url'),
  imagePath: text('image_path'),
  isActive: boolean('is_active').notNull().default(true),
  soldOut: boolean('sold_out').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
