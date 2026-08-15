import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BarChart3, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { verifyMusaReportPin, type MusaReportSecurityStatus } from "../../services/reportSecurity";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Field";

type MusaReportAccessGateProps = {
  status: MusaReportSecurityStatus;
  isAdministrator: boolean;
  onUnlocked: () => void;
  onConfigure: () => void;
};

function accessTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function MusaReportAccessGate({ status, isAdministrator, onUnlocked, onConfigure }: MusaReportAccessGateProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const blocked = Boolean(status.bloqueado_hasta && new Date(status.bloqueado_hasta).getTime() > Date.now());
  const mutation = useMutation({
    mutationFn: verifyMusaReportPin,
    onSuccess: (result) => {
      setPin("");
      if (result.exito) {
        setError(null);
        onUnlocked();
        return;
      }
      setError(result.bloqueado_hasta
        ? `${result.mensaje} Podras intentarlo despues de ${accessTime(result.bloqueado_hasta)}.`
        : result.mensaje);
    },
    onError: (nextError) => setError(nextError instanceof Error ? nextError.message : "No se pudo validar el PIN.")
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^\d{4,8}$/.test(pin)) {
      setError("Ingresa un PIN de 4 a 8 digitos.");
      return;
    }
    mutation.mutate(pin);
  };

  return (
    <Card>
      <section className="musa-access-gate" aria-labelledby="musa-report-access-title">
        <div className="musa-access-gate__icon"><BarChart3 aria-hidden="true" /></div>
        <div className="musa-access-gate__content">
          <span className="eyebrow">Reporte protegido</span>
          <h2 id="musa-report-access-title">Reportes de la sede Musa</h2>
          <p>Ingresa el mismo PIN de Caja Musa. Esta consulta no abre ni ocupa la caja de recepcion.</p>

          {!status.configurado ? (
            <div className="stack stack--compact">
              <div className="alert alert--info">El PIN de Musa aun no esta configurado.</div>
              {isAdministrator ? <Button type="button" variant="primary" onClick={onConfigure}><ShieldCheck /> Configurar en Administracion</Button> : <p className="muted">Solicita al administrador que configure el PIN.</p>}
            </div>
          ) : (
            <form className="musa-access-form" onSubmit={submit}>
              <label htmlFor="musa-report-pin">PIN de acceso</label>
              <div className="musa-access-form__controls">
                <Input
                  id="musa-report-pin"
                  type="password"
                  inputMode="numeric"
                  voiceMode="off"
                  autoComplete="off"
                  maxLength={8}
                  value={pin}
                  disabled={blocked || mutation.isPending}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
                <Button type="submit" variant="primary" disabled={blocked || mutation.isPending}>
                  <KeyRound /> {mutation.isPending ? "Validando..." : "Ver reportes"}
                </Button>
              </div>
              <small>La autorizacion corresponde solo a esta sesion y se puede cerrar manualmente.</small>
              {blocked ? <div className="alert"><LockKeyhole /> Acceso bloqueado hasta {accessTime(status.bloqueado_hasta)}.</div> : null}
              {error ? <div className="alert" role="alert">{error}</div> : null}
            </form>
          )}
        </div>
      </section>
    </Card>
  );
}