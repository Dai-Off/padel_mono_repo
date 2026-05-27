export type InfoScreenId = 'help' | 'how-it-works' | 'terms' | 'privacy';

export type InfoBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'contact'; email: string; label?: string };

export type InfoScreenContent = {
  title: string;
  lastUpdated: string;
  blocks: InfoBlock[];
};

export const SUPPORT_EMAIL = 'soporte@wematch.com';

export const INFO_SCREENS: Record<InfoScreenId, InfoScreenContent> = {
  help: {
    title: 'Ayuda',
    lastUpdated: '27 de mayo de 2026',
    blocks: [
      {
        type: 'paragraph',
        text: '¿Necesitas ayuda con WeMatch? Aquí encontrarás respuestas a las consultas más habituales y cómo contactar con nuestro equipo de soporte.',
      },
      { type: 'heading', text: 'Preguntas frecuentes' },
      {
        type: 'heading',
        text: 'Reservas y pistas',
      },
      {
        type: 'list',
        items: [
          'Para reservar una pista, entra en la pestaña Pistas, elige club, fecha y franja horaria disponible.',
          'Las reservas confirmadas aparecen en tu calendario. Si el pago queda pendiente, tendrás un tiempo limitado para completarlo.',
          'Las cancelaciones dependen de la política de cada club. Revisa las condiciones antes de confirmar.',
        ],
      },
      {
        type: 'heading',
        text: 'Partidos y nivel',
      },
      {
        type: 'list',
        items: [
          'Puedes unirte a partidos abiertos o crear uno nuevo e invitar a otros jugadores.',
          'Tu nivel se calcula a partir de tu actividad y evaluaciones. Completa el cuestionario inicial para empezar con una base más precisa.',
          'Si un partido se cancela, recibirás una notificación y, cuando aplique, el reembolso según el método de pago.',
        ],
      },
      {
        type: 'heading',
        text: 'Pagos y monedero',
      },
      {
        type: 'list',
        items: [
          'Los pagos con tarjeta se procesan de forma segura a través de Stripe.',
          'El monedero guarda saldo a favor en clubes concretos; no es un saldo global transferible entre clubes.',
          'Si ves un cargo incorrecto, contacta con soporte indicando fecha, club e importe.',
        ],
      },
      {
        type: 'heading',
        text: 'Cuenta y acceso',
      },
      {
        type: 'list',
        items: [
          'Puedes editar tu perfil, teléfono y preferencias desde el menú lateral.',
          'Para cambiar tu contraseña, ve a Ajustes → Seguridad.',
          'Si no recibes el correo de recuperación, revisa spam o escribe a soporte.',
        ],
      },
      { type: 'heading', text: 'Contactar con soporte' },
      {
        type: 'paragraph',
        text: 'Nuestro equipo atiende incidencias técnicas, dudas sobre reservas, pagos y cuenta. Indica siempre tu correo de registro y, si aplica, el club y la fecha del problema.',
      },
      {
        type: 'contact',
        email: SUPPORT_EMAIL,
        label: 'Enviar correo a soporte',
      },
      {
        type: 'paragraph',
        text: 'Horario orientativo de respuesta: lunes a viernes, 9:00–18:00 (hora peninsular). Fuera de ese horario atenderemos tu solicitud lo antes posible.',
      },
    ],
  },
  'how-it-works': {
    title: 'Cómo funciona WeMatch',
    lastUpdated: '27 de mayo de 2026',
    blocks: [
      {
        type: 'paragraph',
        text: 'WeMatch conecta jugadores de pádel con clubes, partidos, clases y competiciones en un solo lugar. Esta guía resume el flujo principal de la app.',
      },
      { type: 'heading', text: '1. Crea tu perfil de jugador' },
      {
        type: 'paragraph',
        text: 'Regístrate con tu correo, completa tu perfil y el cuestionario de nivelación. Cuanto más completo esté tu perfil, mejores recomendaciones recibirás de partidos y compañeros.',
      },
      { type: 'heading', text: '2. Explora clubes y reserva pistas' },
      {
        type: 'paragraph',
        text: 'En Pistas puedes ver clubes cercanos, consultar disponibilidad en tiempo real y reservar franjas horarias. Algunos clubes permiten reservar clases o bloquear pistas para partidos privados.',
      },
      { type: 'heading', text: '3. Juega partidos' },
      {
        type: 'list',
        items: [
          'Partidos abiertos: únete a huecos disponibles filtrando por nivel, fecha y club.',
          'Crear partido: elige pista, horario, nivel objetivo e invita a otros jugadores.',
          'Partido privado: visible solo para quienes invites; no aparece en el listado público.',
          'Tras jugar, puedes valorar la experiencia para mejorar el emparejamiento futuro.',
        ],
      },
      { type: 'heading', text: '4. Clases y formación' },
      {
        type: 'paragraph',
        text: 'Desde Escuela puedes inscribirte en cursos y clases de clubes asociados. Tu actividad formativa queda registrada en Tu actividad → Clases.',
      },
      { type: 'heading', text: '5. Competiciones' },
      {
        type: 'paragraph',
        text: 'Torneos y ligas publicados por los clubes pueden requerir inscripción y pago. Consulta reglamento, fechas y categorías antes de apuntarte.',
      },
      { type: 'heading', text: '6. Pagos y monedero' },
      {
        type: 'list',
        items: [
          'Paga reservas, inscripciones y cuotas con tarjeta de forma segura.',
          'El monedero acumula saldo a favor en un club concreto (por ejemplo, tras una cancelación con crédito).',
          'Gestiona tus métodos de pago en Tus pagos, desde el menú lateral.',
        ],
      },
      { type: 'heading', text: '7. Comunidad' },
      {
        type: 'paragraph',
        text: 'Mensajes, grupos y funciones sociales te permiten coordinar partidos y mantener contacto con otros jugadores. Puedes ajustar notificaciones en Ajustes.',
      },
      {
        type: 'paragraph',
        text: 'WeMatch evoluciona con nuevas funciones. Si tienes sugerencias, escríbenos a soporte — tu feedback nos ayuda a mejorar la experiencia de todos.',
      },
      {
        type: 'contact',
        email: SUPPORT_EMAIL,
        label: 'Contactar con soporte',
      },
    ],
  },
  terms: {
    title: 'Condiciones de uso',
    lastUpdated: '27 de mayo de 2026',
    blocks: [
      {
        type: 'paragraph',
        text: 'Estas Condiciones de uso regulan el acceso y utilización de la aplicación WeMatch (en adelante, «la App»), operada por WeMatch. Al crear una cuenta o usar la App, aceptas estos términos.',
      },
      { type: 'heading', text: '1. Objeto del servicio' },
      {
        type: 'paragraph',
        text: 'WeMatch facilita la reserva de pistas, gestión de partidos, inscripción en actividades deportivas, pagos y comunicación entre jugadores y clubes. WeMatch actúa como intermediario tecnológico; la prestación deportiva en instalaciones corresponde a cada club.',
      },
      { type: 'heading', text: '2. Registro y cuenta' },
      {
        type: 'list',
        items: [
          'Debes ser mayor de edad o contar con autorización de tu tutor legal.',
          'La información que proporciones debe ser veraz y estar actualizada.',
          'Eres responsable de la confidencialidad de tus credenciales y de toda actividad en tu cuenta.',
          'WeMatch puede suspender cuentas que incumplan estas condiciones o perjudiquen a otros usuarios.',
        ],
      },
      { type: 'heading', text: '3. Reservas y cancelaciones' },
      {
        type: 'paragraph',
        text: 'Cada reserva queda sujeta a disponibilidad del club y a sus políticas de cancelación, que se muestran antes de confirmar. Los reembolsos, cuando procedan, se gestionarán según la política del club y el método de pago utilizado.',
      },
      { type: 'heading', text: '4. Pagos' },
      {
        type: 'paragraph',
        text: 'Los pagos se procesan mediante proveedores externos certificados (p. ej. Stripe). WeMatch no almacena datos completos de tarjeta. Los precios, impuestos y comisiones aplicables se indican antes de confirmar cada operación.',
      },
      { type: 'heading', text: '5. Conducta del usuario' },
      {
        type: 'list',
        items: [
          'Usar la App de forma lícita, respetuosa y conforme al espíritu deportivo.',
          'No acosar, insultar ni discriminar a otros usuarios.',
          'No crear reservas ficticias, manipular valoraciones ni intentar eludir pagos.',
          'No realizar ingeniería inversa, scraping masivo ni uso automatizado no autorizado.',
        ],
      },
      { type: 'heading', text: '6. Propiedad intelectual' },
      {
        type: 'paragraph',
        text: 'La App, su diseño, marcas y contenidos son propiedad de WeMatch o de sus licenciantes. No se concede ningún derecho de explotación más allá del uso personal permitido por estas condiciones.',
      },
      { type: 'heading', text: '7. Limitación de responsabilidad' },
      {
        type: 'paragraph',
        text: 'WeMatch no se hace responsable de lesiones, daños materiales o incidencias ocurridas en las instalaciones de los clubes, ni de interrupciones del servicio por causas ajenas a su control. La App se ofrece «tal cual», dentro de los límites permitidos por la ley aplicable.',
      },
      { type: 'heading', text: '8. Modificaciones' },
      {
        type: 'paragraph',
        text: 'Podemos actualizar estas condiciones. Te notificaremos cambios relevantes por la App o por correo. El uso continuado tras la entrada en vigor implica aceptación de la versión vigente.',
      },
      { type: 'heading', text: '9. Ley aplicable' },
      {
        type: 'paragraph',
        text: 'Estas condiciones se rigen por la legislación española. Para reclamaciones de consumo puedes acudir a las vías extrajudiciales de resolución de conflictos reconocidas en la UE.',
      },
      {
        type: 'contact',
        email: SUPPORT_EMAIL,
        label: 'Consultas sobre condiciones de uso',
      },
    ],
  },
  privacy: {
    title: 'Política de privacidad',
    lastUpdated: '27 de mayo de 2026',
    blocks: [
      {
        type: 'paragraph',
        text: 'En WeMatch tratamos tus datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y la normativa española de protección de datos. Esta política explica qué recogemos, para qué lo usamos y cuáles son tus derechos.',
      },
      { type: 'heading', text: '1. Responsable del tratamiento' },
      {
        type: 'paragraph',
        text: 'WeMatch es responsable del tratamiento de los datos asociados a tu cuenta WeMatch. Para ejercer tus derechos puedes escribir a soporte indicando «Protección de datos» en el asunto.',
      },
      { type: 'heading', text: '2. Datos que recogemos' },
      {
        type: 'list',
        items: [
          'Identificación: nombre, correo, teléfono, foto de perfil y nombre de usuario.',
          'Deportivos: nivel, preferencias de juego, historial de partidos, clases y competiciones.',
          'Transaccionales: reservas, pagos, saldo de monedero e identificadores de transacción (sin datos completos de tarjeta).',
          'Técnicos: identificador de dispositivo, logs de uso, dirección IP y datos de diagnóstico.',
          'Comunicaciones: mensajes enviados a través de la App y preferencias de notificaciones.',
        ],
      },
      { type: 'heading', text: '3. Finalidades y bases legales' },
      {
        type: 'list',
        items: [
          'Prestación del servicio (ejecución del contrato): gestionar reservas, partidos, pagos y cuenta.',
          'Mejora del producto (interés legítimo): analítica agregada, seguridad y prevención de fraude.',
          'Comunicaciones comerciales (consentimiento): novedades y promociones, revocable en cualquier momento.',
          'Obligaciones legales: conservación de facturación y respuesta a autoridades cuando proceda.',
        ],
      },
      { type: 'heading', text: '4. Compartición con terceros' },
      {
        type: 'paragraph',
        text: 'Compartimos datos estrictamente necesarios con clubes donde reservas o participas, proveedores de pago (Stripe), infraestructura cloud (Supabase) y servicios de correo. No vendemos tus datos personales a terceros.',
      },
      { type: 'heading', text: '5. Conservación' },
      {
        type: 'paragraph',
        text: 'Conservamos tus datos mientras mantengas la cuenta activa y el tiempo adicional exigido por obligaciones legales o para la defensa de reclamaciones. Tras solicitar la eliminación, bloquearemos o borraremos los datos salvo conservación legal obligatoria.',
      },
      { type: 'heading', text: '6. Tus derechos' },
      {
        type: 'list',
        items: [
          'Acceso, rectificación y supresión de tus datos.',
          'Limitación u oposición a determinados tratamientos.',
          'Portabilidad de los datos que nos hayas facilitado.',
          'Retirar el consentimiento cuando el tratamiento se base en él.',
          'Presentar reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).',
        ],
      },
      { type: 'heading', text: '7. Seguridad' },
      {
        type: 'paragraph',
        text: 'Aplicamos medidas técnicas y organizativas razonables: cifrado en tránsito, control de accesos, auditoría de permisos y almacenamiento seguro. Ningún sistema es infalible; te recomendamos usar contraseñas robustas y no compartir tu sesión.',
      },
      { type: 'heading', text: '8. Menores' },
      {
        type: 'paragraph',
        text: 'WeMatch no está dirigida a menores de 14 años sin supervisión. Si detectamos datos de menores recogidos sin base legal válida, procederemos a su eliminación.',
      },
      { type: 'heading', text: '9. Cambios en esta política' },
      {
        type: 'paragraph',
        text: 'Actualizaremos esta política cuando cambien nuestras prácticas o la normativa. Publicaremos la fecha de última revisión al inicio del documento.',
      },
      {
        type: 'contact',
        email: SUPPORT_EMAIL,
        label: 'Ejercer derechos de privacidad',
      },
    ],
  },
};
