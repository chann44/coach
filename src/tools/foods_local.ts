interface LocalFood {
  aliases: string[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const FOODS_LOCAL: LocalFood[] = [
  { aliases: ["roti", "chapati", "1 roti"], calories: 120, protein_g: 4, carbs_g: 22, fat_g: 2 },
  { aliases: ["naan", "butter naan"], calories: 300, protein_g: 9, carbs_g: 45, fat_g: 10 },
  { aliases: ["plain dosa", "dosa"], calories: 170, protein_g: 4, carbs_g: 25, fat_g: 6 },
  { aliases: ["masala dosa"], calories: 290, protein_g: 7, carbs_g: 39, fat_g: 11 },
  { aliases: ["idli", "2 idli"], calories: 130, protein_g: 4, carbs_g: 26, fat_g: 1 },
  { aliases: ["sambar"], calories: 90, protein_g: 4, carbs_g: 12, fat_g: 3 },
  { aliases: ["paneer tikka"], calories: 300, protein_g: 22, carbs_g: 10, fat_g: 18 },
  { aliases: ["paneer butter masala"], calories: 420, protein_g: 16, carbs_g: 16, fat_g: 32 },
  { aliases: ["dal", "dal tadka"], calories: 190, protein_g: 10, carbs_g: 24, fat_g: 6 },
  { aliases: ["rajma", "rajma chawal"], calories: 340, protein_g: 13, carbs_g: 52, fat_g: 8 },
  { aliases: ["chole", "chole bhature"], calories: 430, protein_g: 15, carbs_g: 52, fat_g: 18 },
  { aliases: ["veg biryani"], calories: 360, protein_g: 9, carbs_g: 57, fat_g: 11 },
  { aliases: ["chicken biryani"], calories: 430, protein_g: 22, carbs_g: 54, fat_g: 14 },
  { aliases: ["egg biryani"], calories: 410, protein_g: 17, carbs_g: 53, fat_g: 14 },
  { aliases: ["upma"], calories: 220, protein_g: 5, carbs_g: 35, fat_g: 7 },
  { aliases: ["poha"], calories: 210, protein_g: 5, carbs_g: 36, fat_g: 5 },
  { aliases: ["paratha", "aloo paratha"], calories: 310, protein_g: 8, carbs_g: 40, fat_g: 13 },
  { aliases: ["curd rice"], calories: 290, protein_g: 8, carbs_g: 41, fat_g: 10 },
  { aliases: ["khichdi"], calories: 260, protein_g: 9, carbs_g: 44, fat_g: 6 },
  { aliases: ["paneer bhurji"], calories: 310, protein_g: 20, carbs_g: 8, fat_g: 22 }
];

export function searchFoodsLocal(query: string): Omit<LocalFood, "aliases"> | null {
  const q = normalize(query);

  for (const food of FOODS_LOCAL) {
    for (const alias of food.aliases) {
      const a = normalize(alias);
      if (q === a || q.includes(a) || a.includes(q)) {
        return {
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fat_g: food.fat_g
        };
      }
    }
  }

  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
