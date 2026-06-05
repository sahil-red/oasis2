import { catalogSearchIlikeTerm } from "@/lib/search/catalog-query-text";

const cases: [string, string | null][] = [
  ["healthy noodles", "noodles"],
  ["healthy maggi", "maggi"],
  ["amul milk", "amul milk"],
];

let failed = 0;
for (const [q, want] of cases) {
  const got = catalogSearchIlikeTerm(q);
  if (got !== want) {
    console.error(`FAIL "${q}": got ${got}, want ${want}`);
    failed++;
  }
}
if (failed) process.exit(1);
console.log("catalog-query-text selftest passed");
