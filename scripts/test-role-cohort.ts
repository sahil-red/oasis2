#!/usr/bin/env -S pnpm tsx
import { inferRoleCohort } from "@/lib/scoring/role-cohort";

type Case = { label: string; input: Parameters<typeof inferRoleCohort>[0]; want: string };

const cases: Case[] = [
  {
    label: "flour in Oil & Dals aisle (bug 1)",
    input: {
      name: "Organic Tattva Multigrain Flour",
      category: "Atta, Rice, Oil & Dals",
      subcategory: "Atta",
    },
    want: "staple",
  },
  {
    label: "mustard oil (adjunct by subcategory)",
    input: {
      name: "Anveshan Mustard Wood Cold Pressed Oil",
      category: "Atta, Rice, Oil & Dals",
      subcategory: "Oil",
    },
    want: "adjunct",
  },
  {
    label: "soda water (bug 2)",
    input: {
      name: "Malaki Soda Water | Carbonated Soda Water",
      category: "Cold Drinks & Juices",
      subcategory: "Soda & Mixers",
    },
    want: "staple",
  },
  {
    label: "cola is treat",
    input: {
      name: "Coca Cola",
      category: "Cold Drinks & Juices",
      subcategory: "Soft Drinks",
    },
    want: "treat",
  },
  {
    label: "rice cakes not dessert",
    input: {
      name: "Pintola Brown Rice Cakes",
      category: "Munchies",
      subcategory: "Namkeens",
    },
    want: "snack",
  },
  {
    label: "chips by subcategory",
    input: { name: "Lays Classic", category: "Munchies", subcategory: "Chips & Crisps" },
    want: "snack",
  },
  {
    label: "atta by subcategory only",
    input: { name: "Aashirvaad Select", category: "Atta, Rice, Oil & Dals", subcategory: "Atta" },
    want: "staple",
  },
];

let failed = 0;
for (const c of cases) {
  const got = inferRoleCohort(c.input);
  if (got !== c.want) {
    console.error(`FAIL ${c.label}: want=${c.want} got=${got}`);
    failed++;
  } else {
    console.log(`ok  ${c.label} -> ${got}`);
  }
}
if (failed) process.exit(1);
console.log(`\n${cases.length} passed`);
