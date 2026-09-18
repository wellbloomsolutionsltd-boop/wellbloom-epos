type ReceiptProps = {
  sale: {
    saleNumber: string;
    receiptNumber: string;
    subtotal: string;
    discount: string;
    total: string;
    change: string;
    createdAt: string;

    branch: {
      name: string;
      code: string;
    };

    items: {
      id: string;
      quantity: string;
      unitPrice: string;
      lineTotal: string;

      product: {
        name: string;
        sku: string;
        barcode: string | null;
      };
    }[];

    payments: {
      id: string;
      method: string;
      amount: string;
      reference?: string | null;
    }[];
  };
};

function money(value: string | number) {
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Receipt({
  sale,
}: ReceiptProps) {
  const saleDate = new Date(sale.createdAt);

  return (
    <div
      id="thermal-receipt"
      className="mx-auto w-[80mm] bg-white p-3 text-black"
    >
      <div className="text-center">
        <h1 className="text-lg font-bold">
          WELLBLOOM SOLUTIONS LIMITED
        </h1>

        <p className="text-xs">
          {sale.branch.name}
        </p>

        <p className="text-xs">
          Branch Code: {sale.branch.code}
        </p>

        <div className="my-2 border-t border-dashed border-black" />

        <p className="font-bold">
          SALES RECEIPT
        </p>

        <p className="text-xs">
          Receipt: {sale.receiptNumber}
        </p>

        <p className="text-xs">
          {saleDate.toLocaleDateString("en-KE")} {" "}
          {saleDate.toLocaleTimeString("en-KE")}
        </p>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-3 text-xs">
        {sale.items.map((item) => (
          <div key={item.id}>
            <p className="font-semibold">
              {item.product.name}
            </p>

            <div className="flex justify-between">
              <span>
                {Number(item.quantity)} x KES {money(item.unitPrice)}
              </span>

              <span>
                {money(item.lineTotal)}
              </span>
            </div>

            <p className="text-[10px]">
              SKU: {item.product.sku}
            </p>

            {item.product.barcode && (
              <p className="text-[10px]">
                Barcode: {item.product.barcode}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>

          <span>
            KES {money(sale.subtotal)}
          </span>
        </div>

        <div className="flex justify-between">
          <span>Discount</span>

          <span>
            KES {money(sale.discount)}
          </span>
        </div>

        <div className="flex justify-between text-base font-bold">
          <span>TOTAL</span>

          <span>
            KES {money(sale.total)}
          </span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-1 text-xs">
        {sale.payments.map((payment) => (
          <div
            key={payment.id}
            className="flex justify-between"
          >
            <span>
              {payment.method}
            </span>

            <span>
              KES {money(payment.amount)}
            </span>
          </div>
        ))}

        <div className="flex justify-between font-bold">
          <span>CHANGE</span>

          <span>
            KES {money(sale.change)}
          </span>
        </div>
      </div>

      <div className="my-3 border-t border-dashed border-black" />

      <div className="text-center text-xs">
        <p className="font-semibold">
          Thank you for shopping with us.
        </p>

        <p className="mt-1">
          Goods sold subject to our returns policy.
        </p>

        <p className="mt-3 text-[10px]">
          Powered by WELLBLOOM EPOS
        </p>
      </div>
    </div>
  );
}
