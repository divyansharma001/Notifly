import Handlebars from "handlebars";

// THE TEMPLATE REGISTRY — the single place that owns every message the system
// can send. Callers send a `templateId` + `data`; the wording lives here, not
// scattered through route or worker code. This is the book's "consistent format,
// fewer errors": change the copy once, every send picks it up.
//
// Each template has a `subject` and a `body`, both Handlebars source strings with
// {{variables}} that get filled from the request's `data`.
//
// We START with templates in code. Moving them to a DB table later (so non-
// engineers can edit copy) is a swap behind this same renderTemplate() function
// — deliberately deferred so this phase stays about the templating concept.
const TEMPLATES: Record<string, { subject: string; body: string }> = {
  order_shipped: {
    subject: "Your order {{orderId}} has shipped",
    body: "Hi {{name}}, your order {{orderId}} is on its way and should arrive {{eta}}.",
  },
  welcome: {
    subject: "Welcome to Notify, {{name}}!",
    body: "Hi {{name}}, thanks for signing up. We're glad you're here.",
  },
  password_reset: {
    subject: "Reset your password",
    body: "Hi {{name}}, click the link to reset your password: {{link}}",
  },
};

// A compiled Handlebars template is a FUNCTION (data -> string). Compiling parses
// the source string and is the slow part; running the function is fast. So we
// compile each template ONCE on first use and cache the result here — every
// later send reuses the function instead of re-parsing the same string.
type Compiled = {
  subject: HandlebarsTemplateDelegate;
  body: HandlebarsTemplateDelegate;
};
const cache = new Map<string, Compiled>();

function compile(templateId: string): Compiled | null {
  const cached = cache.get(templateId);
  if (cached) return cached;

  const tpl = TEMPLATES[templateId];
  if (!tpl) return null; // unknown template — caller turns this into a 422

  // noEscape: our channels (SMS / push / console) are PLAIN TEXT, so we want
  // raw output — "Tom & Jerry", not "Tom &amp; Jerry". The default escapes for
  // HTML safety; if we add real HTML email later we'd escape per-channel instead.
  const compiled: Compiled = {
    subject: Handlebars.compile(tpl.subject, { noEscape: true }),
    body: Handlebars.compile(tpl.body, { noEscape: true }),
  };
  cache.set(templateId, compiled);
  return compiled;
}

// Render a template to final text. Returns null for an unknown templateId so the
// caller can answer with a clean 422 instead of crashing. Missing variables in
// `data` render as empty strings (Handlebars' default) — we don't hard-fail on
// them here; the request was structurally valid, the copy just had a gap.
export function renderTemplate(
  templateId: string,
  data: Record<string, string>,
): { subject: string; body: string } | null {
  const compiled = compile(templateId);
  if (!compiled) return null;

  return {
    subject: compiled.subject(data),
    body: compiled.body(data),
  };
}
