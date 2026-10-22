INSERT INTO products (id, name, family, notes, price, size, tag, glass, liquid, cap, backdrop, shape) VALUES
('velvet-bloom', 'Velvet Bloom', 'Floral', 'Rose · pink pepper · musk', 86, '50 ml', 'Bestseller', '#e8cfd2', '#b97880', '#6B1F3A', '#EDE3D7', 'square'),
('cedar-veil', 'Cedar Veil', 'Woody', 'Cedarwood · fig · sandalwood', 92, '50 ml', 'New', '#e2d6c9', '#a88f72', '#B08D57', '#E5D9CC', 'slim'),
('citrus-hour', 'Citrus Hour', 'Fresh', 'Bergamot · neroli · green tea', 78, '50 ml', NULL, '#f1e8d4', '#c3a66e', '#A88A5A', '#F3EBDD', 'round'),
('amber-muse', 'Amber Muse', 'Amber', 'Vanilla · amber · tonka bean', 98, '50 ml', NULL, '#e8d5c4', '#b08d57', '#6B1F3A', '#EDE3D7', 'square'),
('soft-focus', 'Soft Focus', 'Floral', 'Peony · pear · white musk', 82, '50 ml', NULL, '#eadbd5', '#c89a92', '#8B7968', '#F2E6E3', 'round'),
('after-rain', 'After the Rain', 'Fresh', 'Moss · mint · clean musk', 80, '50 ml', NULL, '#e0d8d0', '#9d8774', '#3D1125', '#E7E2DC', 'slim')
ON CONFLICT (id) DO NOTHING;
