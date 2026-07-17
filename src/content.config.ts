import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

const categories = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/content/categories' }),
  schema: z.object({
    label: z.string(),
    description: z.string(),
    emoji: z.string().optional(),
    sortOrder: z.number().default(0),
  }),
});

const products = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/products' }),
  schema: z.object({
    title: z.string(),
    category: reference('categories'),
    price: z.number().positive(),
    imageUrl: z.string().min(1),
    affiliateUrl: z.string().url(),
    rating: z.number().min(1).max(5).optional(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    addedDate: z.coerce.date().default(() => new Date()),
  }),
});

export const collections = { categories, products };
