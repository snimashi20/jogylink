/** "Rs 1,250.00". Always two decimals so columns of prices line up. */
export function formatRs(amount: number): string {
  return `Rs ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "1.10", "1.25", "1.2345": two decimals at least, up to four when needed. */
export function formatMarkup(markup: number): string {
  return markup.toFixed(4).replace(/0{1,2}$/, '');
}
