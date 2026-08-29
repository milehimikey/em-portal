model "Producer"

persona Operator
context Sales

slice "Emit Signal" {
  ui Emit Signal Screen @Operator
  command Emit Signal
  event Signal Emitted @Sales public
}
