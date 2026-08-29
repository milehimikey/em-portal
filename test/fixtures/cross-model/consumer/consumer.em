model "Consumer"

persona Operator
context Sales

slice "React To Signal" {
  ui React To Signal Screen @Operator
  command Handle Signal Emitted
  event Signal Emitted Handled @Sales
}
