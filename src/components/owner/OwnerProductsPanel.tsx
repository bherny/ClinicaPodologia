import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Banknote, Edit, PackagePlus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field, Input, Select, Textarea } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { queryClient } from "../../lib/queryClient";
import { money } from "../../lib/format";
import { createSale } from "../../services/sales";
import { deactivateProduct, listProducts, upsertProduct } from "../../services/attendance";
import type { MetodoPago, Producto, Sede } from "../../types/domain";

const PAYMENT_LABELS: Record<MetodoPago, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mixto: "Mixto",
  otro: "Otro"
};

export function OwnerProductsPanel({ branches, defaultBranchId }: { branches: Sede[]; defaultBranchId: string }) {
  const [productDraft, setProductDraft] = useState<Partial<Producto> | null>(null);
  const [saleOpen, setSaleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const productsQuery = useQuery({ queryKey: ["owner-products"], queryFn: () => listProducts(true) });
  const deactivateMutation = useMutation({
    mutationFn: deactivateProduct,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["owner-products"] }),
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo desactivar el producto.")
  });

  return (
    <section className="owner-section stack">
      <div className="owner-section__heading">
        <div><h2>Productos y venta rapida</h2><p>Las ventas registradas aqui ingresan a la misma Caja y ventas de Body Feet.</p></div>
        <div className="inline">
          <Button type="button" onClick={() => setProductDraft({ activo: true, precio: 0 })}><PackagePlus /> Nuevo producto</Button>
          <Button type="button" variant="primary" disabled={!productsQuery.data?.some((item) => item.activo)} onClick={() => setSaleOpen(true)}><ShoppingBag /> Nueva venta</Button>
        </div>
      </div>
      {error ? <div className="alert">{error}</div> : null}
      {productsQuery.data?.length ? (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Producto</th><th>SKU</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{productsQuery.data.map((product) => <tr key={product.id}>
            <td data-label="Producto"><strong>{product.nombre}</strong><div className="muted">{product.descripcion}</div></td>
            <td data-label="SKU">{product.sku || "-"}</td>
            <td data-label="Precio"><strong>{money(product.precio)}</strong></td>
            <td data-label="Estado">{product.activo ? "Activo" : "Inactivo"}</td>
            <td data-label="Acciones"><div className="inline"><Button type="button" aria-label="Editar producto" onClick={() => setProductDraft(product)}><Edit /></Button><Button type="button" variant="danger" aria-label="Desactivar producto" disabled={!product.activo || deactivateMutation.isPending} onClick={() => { if (confirm("Desactivar este producto? Las ventas anteriores se conservaran.")) deactivateMutation.mutate(product.id); }}><Trash2 /></Button></div></td>
          </tr>)}</tbody>
        </table></div>
      ) : <EmptyState title="Sin productos" description="Crea el primer producto para habilitar la venta rapida." />}

      {productDraft ? <ProductModal product={productDraft} onClose={() => setProductDraft(null)} /> : null}
      {saleOpen ? <QuickSaleModal products={(productsQuery.data ?? []).filter((item) => item.activo)} branches={branches} defaultBranchId={defaultBranchId} onClose={() => setSaleOpen(false)} /> : null}
    </section>
  );
}

function ProductModal({ product, onClose }: { product: Partial<Producto>; onClose: () => void }) {
  const [values, setValues] = useState(product);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      if (!values.nombre?.trim()) throw new Error("Ingresa el nombre del producto.");
      return upsertProduct(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner-products"] });
      onClose();
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo guardar el producto.")
  });
  return <Modal title={product.id ? "Editar producto" : "Nuevo producto"} onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button type="button" variant="primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Guardando..." : "Guardar producto"}</Button></>}>
    <div className="stack">{error ? <div className="alert">{error}</div> : null}<div className="form-grid">
      <Field label="Nombre"><Input value={values.nombre ?? ""} onChange={(event) => setValues({ ...values, nombre: event.target.value })} /></Field>
      <Field label="SKU opcional"><Input value={values.sku ?? ""} onChange={(event) => setValues({ ...values, sku: event.target.value })} /></Field>
      <Field label="Precio"><Input type="number" min="0" step="0.01" value={values.precio ?? 0} onChange={(event) => setValues({ ...values, precio: Number(event.target.value) })} /></Field>
      <Field label="Estado"><Select value={values.activo === false ? "false" : "true"} onChange={(event) => setValues({ ...values, activo: event.target.value === "true" })}><option value="true">Activo</option><option value="false">Inactivo</option></Select></Field>
      <div className="field span-2"><label>Descripcion</label><Textarea value={values.descripcion ?? ""} onChange={(event) => setValues({ ...values, descripcion: event.target.value })} /></div>
    </div></div>
  </Modal>;
}

function QuickSaleModal({ products, branches, defaultBranchId, onClose }: { products: Producto[]; branches: Sede[]; defaultBranchId: string; onClose: () => void }) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [branchId, setBranchId] = useState(defaultBranchId !== "all" ? defaultBranchId : branches[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(Number(products[0]?.precio ?? 0));
  const [payment, setPayment] = useState<MetodoPago>("efectivo");
  const [operation, setOperation] = useState("");
  const [customer, setCustomer] = useState("Venta mostrador");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectedProduct = products.find((item) => item.id === productId);
  const total = useMemo(() => Math.max(0, quantity * price), [price, quantity]);

  useEffect(() => {
    if (selectedProduct) setPrice(Number(selectedProduct.precio));
  }, [selectedProduct]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct || !branchId || quantity <= 0 || price < 0) throw new Error("Completa producto, sede, cantidad y precio.");
      return createSale({
        paciente_id: null,
        cita_id: null,
        sede_id: branchId,
        metodo_pago: payment,
        descuento: 0,
        igv: 0,
        numero_operacion: operation,
        observaciones: notes,
        cliente_tipo_documento: "",
        cliente_numero_documento: "",
        cliente_nombre: customer.trim() || "Venta mostrador",
        cliente_direccion: "",
        items: [{ producto_id: selectedProduct.id, servicio_id: null, descripcion: selectedProduct.nombre, cantidad: quantity, precio_unitario: price }]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      onClose();
    },
    onError: (nextError) => {
      const message = nextError instanceof Error ? nextError.message : "No se pudo registrar la venta.";
      setError(message.includes("Caja Musa") ? `${message} Abre Caja y ventas, desbloquea Musa con su PIN y vuelve a intentarlo.` : message);
    }
  });

  return <Modal title="Nueva venta de producto" onClose={onClose} footer={<><Button type="button" onClick={onClose}>Cancelar</Button><Button type="button" variant="primary" disabled={mutation.isPending || !selectedProduct} onClick={() => mutation.mutate()}><Banknote /> {mutation.isPending ? "Registrando..." : `Cobrar ${money(total)}`}</Button></>}>
    <div className="stack">{error ? <div className="alert">{error}</div> : null}<div className="form-grid">
      <Field label="Producto"><Select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option value={product.id} key={product.id}>{product.nombre}</option>)}</Select></Field>
      <Field label="Sede"><Select value={branchId} onChange={(event) => setBranchId(event.target.value)}>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.nombre}</option>)}</Select></Field>
      <Field label="Cantidad"><Input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></Field>
      <Field label="Precio unitario"><Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(Number(event.target.value))} /></Field>
      <Field label="Medio de pago"><Select value={payment} onChange={(event) => setPayment(event.target.value as MetodoPago)}>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
      <Field label="Numero de operacion"><Input value={operation} onChange={(event) => setOperation(event.target.value)} placeholder="Opcional" /></Field>
      <Field label="Cliente"><Input value={customer} onChange={(event) => setCustomer(event.target.value)} /></Field>
      <Field label="Observaciones"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
    </div><div className="owner-quick-sale-total"><span>Total</span><strong>{money(total)}</strong></div></div>
  </Modal>;
}
