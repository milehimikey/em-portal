model "Checkout" owner "@example/storefront"

persona Customer

context Order

# GH #4: a storyline block makes the portal build render em's own canvas for
# this model (`em render --map` -> storylines/map.html + one SVG per
# storyline). The slices keep their old names — "Checkout" deliberately
# collides with fulfillment's own "Checkout" slice (see this fixture's
# README note in build.test.ts) — the storyline is a label over them.
storyline "Buy something" {
  slice "Checkout" {
    ui Checkout Screen @Customer
    command Submit Order public {
      total: decimal
    }
    invariant INV-CHK-1 "An order is submitted with a positive total"
    event Order Submitted @Order public {
      orderId: uuid assigned
      total: decimal
    }
  }

  slice "Order Confirmation" {
    view Order Confirmation from "Order Submitted"
    ui Confirmation Screen @Customer
  }
}
