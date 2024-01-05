module.exports = {
  tabWidth: 2,
  arrowParens: "avoid",
  importOrder: ["<THIRD_PARTY_MODULES>", "^[./]"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderParserPlugins: ["typescript", "decorators-legacy", "jsx"],
  parser: "typescript",  
  plugins: [require("@trivago/prettier-plugin-sort-imports")],
};
