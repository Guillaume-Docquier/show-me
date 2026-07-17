const stringValue = "// string /* value */"
const regularExpression = /\/\/|\/\*/u
const template = `first
// template text
/* more template text */`
const objectValue = {
  /* ordinary object comment */
  value: true,
}

export const view = (
  <section title="// attribute">
    {/* JSX comment */}
    <span>/* JSX text */</span>
    {stringValue + regularExpression.source + template + String(objectValue.value)}
  </section>
)
