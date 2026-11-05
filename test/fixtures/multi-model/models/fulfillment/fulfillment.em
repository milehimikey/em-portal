model "Fulfillment" owner "@example/warehouse"

persona Warehouse

context Order

# Two storylines with a declared `after` between them, so this model's canvas
# (GH #4) has a real storyline edge to draw — and a translation consuming the
# checkout model's public event, so fixtures/multi-model/system.yaml gives
# `em system` a verified seam for the landing page's context map.
storyline "Fulfil an order" {
  slice "Receive Order" {
    translation Order Intake consumes checkout:event.order-submitted {
      orderId: uuid
      total: decimal
    }
    command Accept Order {
      orderId: uuid
      total: decimal
    }
    invariant INV-FUL-1 "An order is accepted at most once per checkout order id"
    event Order Accepted @Order {
      orderId: uuid
      total: decimal
    }
  }

  slice "Orders To Fulfil" {
    view Orders To Fulfil from "Order Accepted"
    ui Fulfilment Board @Warehouse
  }
}

storyline "Handle a return" after "Fulfil an order" {
  slice "Checkout" {
    ui Return Screen @Warehouse
    command Process Return
    event Return Processed @Order
  }

  slice "Return Confirmation" {
    view Return Confirmation from "Return Processed"
    ui Confirmation Screen @Warehouse
  }
}
