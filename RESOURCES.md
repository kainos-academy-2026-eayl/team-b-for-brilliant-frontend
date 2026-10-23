# Frontend-to-backend architecture resources

## Knowledge

- [MDN: Client-server overview](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/First_steps/Client-Server_overview)
  Primary first reading. Explains HTTP requests, responses and server-generated
  pages. Read the opening "Web servers and HTTP" section before the longer examples.
- [Academy: MVC, controllers and services](https://raw.githubusercontent.com/eoinmcbennett/grad-academy-2026/refs/heads/content-updates-march-26/slides/new-slides/week-1/4-mini-project-api/3-mvc-controllers-services/mvc-controllers-services/mvc-controllers-services.md)
  Course foundation for separating HTTP handling from data/business work and
  reading `async`/`await`. The slides use illustrative class-based examples;
  this repository instead uses router factories and functions.
- [Academy: Models and DTOs](https://raw.githubusercontent.com/eoinmcbennett/grad-academy-2026/refs/heads/content-updates-march-26/slides/new-slides/week-1/4-mini-project-api/4-models-dtos/models-and-dtos/models-and-dtos.md)
  Explains contracts, interfaces and classes. In this repository the product
  models are interfaces: they do not contain runtime validation or database calls.
- [MDN: Overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)
  Use for the request/response model, status codes and the extra asset requests
  a browser makes after receiving HTML.
- [MDN: JSON](https://developer.mozilla.org/en-US/docs/Glossary/JSON)
  Use for the distinction between a text data-transfer format, JavaScript values
  and HTML markup.
- [Node.js: Using fetch](https://nodejs.org/en/learn/getting-started/fetch)
  Shows that `fetch` also runs on servers, not only in browsers. Explains the
  `fetch` then `response.json()` pattern used by the product service.
- [Express: Using middleware](https://expressjs.com/en/guide/using-middleware.html)
  Use for `req`, `res`, `next()` and why middleware can continue or stop a request.
- [Nunjucks: API](https://mozilla.github.io/nunjucks/api.html)
  Use for templates plus context producing rendered output. The app configures
  Nunjucks with Express and autoescaping.
- [Nunjucks: Templating](https://mozilla.github.io/nunjucks/templating.html)
  Primary reading for lesson 2. Use Variables, Filters, Template Inheritance,
  If, For, Block and Include to interpret the existing page templates.
- [Express: Template engines](https://expressjs.com/en/guide/using-template-engines.html)
  Use for how a controller's render call chooses a view and supplies values.
- [Express: Response locals](https://expressjs.com/en/5x/api/response/#reslocals)
  Use for request-scoped shared template values such as sign-in state and the
  CSRF token; distinguish these from page-specific render arguments.
- [MDN: What is CSS?](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Styling_basics/What_is_CSS)
  Use for separating generated HTML structure from visual styling and layout.
- [Zod: Basics](https://zod.dev/basics)
  Use for runtime validation, `safeParse` and distinguishing success from invalid
  data returned by an external service.
- [TypeScript Handbook: The basics, erased types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types)
  Use for why TypeScript annotations/interfaces do not validate network data
  when the JavaScript application runs.

The linked repository source is the source of truth for this application's
specific behavior. External documentation explains the tools, not a promise
that every possible route in this app follows the same path.

## Wisdom (Communities)

No community has been selected yet. The immediate goal is understanding the
learner's own application; no community participation is required for lesson 1.

## Gaps

- No understanding has yet been demonstrated through recall or explanation.
  Use the first lesson's checks and the learner's follow-up answers to select
  the next lesson.
- The backend repository and database implementation are outside lesson 1.
  Do not infer their internal behavior from the frontend's HTTP calls.
