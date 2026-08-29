model "Broken"

persona Customer
context Order

slice "Bad Slice" {
  view Something from "Nonexistent Event"
}
