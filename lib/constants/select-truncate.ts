// Long Select values ("02 · ကိသာဂေါတမီ (Old version)", "1.2 — Close reaction ·
// Child in arms") overflow the trigger. GeckoUI has no prop for the value span,
// and its own styles rule out truncation twice over: `__content` is
// `flex-wrap: wrap; overflow-x: scroll`, and `__value` is `display: flex`, which
// makes `truncate` a no-op. Override both through `wrapperClassName`.
//
// `String.raw` is required, not style: a bare `_` in a Tailwind arbitrary
// variant means a space, so the underscores have to be backslash-escaped — and
// Tailwind generates utilities by scanning this file's raw text, so a normal
// string literal would register a class with two backslashes while the runtime
// value has one, and nothing would match.
//
// Shared so there is exactly one spelling of it: a second copy written as a
// plain string would silently generate no CSS and appear to work only because
// this file happens to generate the same classes.
export const TRUNCATE_SELECT_VALUE = String.raw`[&_.GeckoUISelectButton\_\_content]:flex-nowrap [&_.GeckoUISelectButton\_\_content]:overflow-hidden [&_.GeckoUISelectButton\_\_value]:block [&_.GeckoUISelectButton\_\_value]:min-w-0 [&_.GeckoUISelectButton\_\_value]:truncate`;
