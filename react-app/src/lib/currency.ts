const ethiopianBirr = new Intl.NumberFormat('en-ET', {
  maximumFractionDigits: 2,
})

export function formatPrice(amount: number) {
  return `ETB ${ethiopianBirr.format(amount)}`
}
