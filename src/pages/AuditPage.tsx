import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { TableSkeleton } from "../components/ui/Skeleton";
import { fullName } from "../lib/format";
import { listAudit } from "../services/admin";

export function AuditPage() {
  const auditQuery = useQuery({ queryKey: ["audit"], queryFn: listAudit });
  const rows = auditQuery.data ?? [];

  return (
    <main className="page">
      <PageHeader
        eyebrow="Auditoria"
        title="Registro de acciones importantes"
        description="Creaciones, ediciones, reprogramaciones, cancelaciones, cambios de estado y eliminaciones logicas."
      />
      <Card>
        {auditQuery.isLoading ? (
          <TableSkeleton />
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Accion</th>
                  <th>Tabla</th>
                  <th>Registro</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) => (
                  <tr key={row.id}>
                    <td>{new Date(row.fecha).toLocaleString("es-PE")}</td>
                    <td>{row.usuario ? fullName(row.usuario) : "Sistema"}</td>
                    <td>{row.accion}</td>
                    <td>{row.tabla_afectada}</td>
                    <td>{row.registro_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Sin eventos de auditoria visibles" />
        )}
      </Card>
    </main>
  );
}
