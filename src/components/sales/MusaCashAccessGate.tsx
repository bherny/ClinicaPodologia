import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { verifyMusaCashPin, type MusaCashSecurityStatus } from "../../services/cashSecurity";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input } from "../ui/Field";

type MusaCashAccessGateProps = {
  status: MusaCashSecurityStatus;
  isAdministrator: boolean;
  onUnlocked: () => void;
  onConfigure: () => void;
};

function accessTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function MusaCashAccessGate({ status, isAdministrator, onUnlocked, onConfigure }: MusaCashAccessGateProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const blocked = Boolean(status.bloqueado_hasta && new Date(status.bloqueado_hasta).getTime() > Date.now());
  const mutation = useMutation({
    mutationFn: verifyMusaCashPin,
    onSuccess: (result) => {
      setPin("");
      if (result.exito) {
        setError(null);
        onUnlocked();
        return;
      }
      setError(result.bloqueado_hasta
        ? `${result.mensaje} Podras intentarlo despues de ${accessTime(result.bloqueado_hasta)}.`
        : `${result.mensaje} Intentos disponibles: ${result.intentos_restantes}.`);
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
      <section className="musa-access-gate" aria-labelledby="musa-access-title">
        <div className="musa-access-gate__icon"><LockKeyhole aria-hidden="true" /></div>
        <div className="musa-access-gate__content">
          <span className="eyebrow">Acceso restringido</span>
          <h2 id="musa-access-title">Caja y ventas de Musa</h2>
          <p>La informacion financiera de esta sede esta protegida con una autorizacion adicional.</p>

          {!status.configurado ? (
            <div className="stack stack--compact">
              <div className="alert alert--info">El PIN de Caja Musa aun no esta configurado.</div>
              {isAdministrator ? <Button type="button" variant="primary" onClick={onConfigure}><ShieldCheck /> Configurar en Administracion</Button> : <p className="muted">Solicita al administrador que configure el PIN.</p>}
            </div>
          ) : (
            <form className="musa-access-form" onSubmit={submit}>
              <label htmlFor="musa-cash-pin">PIN de acceso</label>
              <div className="musa-access-form__controls">
                <Input
                  id="musa-cash-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={pin}
                  disabled={blocked || mutation.isPending}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  autoFocus
                />
                <Button type="submit" variant="primary" disabled={blocked || mutation.isPending}>
                  <KeyRound /> {mutation.isPending ? "Validando..." : "Acceder"}
                </Button>
              </div>
              <small>La autorizacion dura 30 minutos y puede bloquearse manualmente.</small>
              {blocked ? <div className="alert">Acceso bloqueado hasta {accessTime(status.bloqueado_hasta)}.</div> : null}
              {error ? <div className="alert" role="alert">{error}</div> : null}
            </form>
          )}
        </div>
      </section>
    </Card>
  );
}