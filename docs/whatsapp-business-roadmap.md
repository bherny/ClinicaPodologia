# Arquitectura para WhatsApp Business API

La version inicial abre WhatsApp Web o la app movil con el mensaje preparado. El sistema registra manualmente el resultado en la tabla `recordatorios`.

Para automatizar envios en una etapa futura se debe agregar:

1. Cuenta de Meta Business verificada.
2. Numero habilitado para WhatsApp Business Platform.
3. Plantillas aprobadas por Meta.
4. Backend seguro para firmar llamadas con token privado.
5. Webhook para actualizar estados de entrega y respuesta.

Importante: el frontend nunca debe guardar tokens privados de Meta. La integracion debe vivir en un backend, Edge Function de Supabase o servicio seguro equivalente.
