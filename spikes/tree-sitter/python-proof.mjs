import { resolve } from "node:path"
import { Language, Parser } from "web-tree-sitter"

const sourceText = `import os
import package.module as module
from package.feature import value
from .local import helper
`

await Parser.init()
const parser = new Parser()
parser.setLanguage(await Language.load(resolve("node_modules/tree-sitter-python/tree-sitter-python.wasm")))
const tree = parser.parse(sourceText)

const imports = tree.rootNode.descendantsOfType(["import_statement", "import_from_statement"]).map((statement) => ({
  syntax: statement.type,
  source: pythonImportSource(statement),
}))

console.log(
  JSON.stringify(
    {
      hasParseError: tree.rootNode.hasError,
      imports,
      note: "Parsing is generic; dependency meaning and module resolution still require Python-specific code.",
    },
    undefined,
    2,
  ),
)

tree.delete()
parser.delete()

function pythonImportSource(statement) {
  if (statement.type === "import_from_statement") {
    return statement.childForFieldName("module_name")?.text
  }
  return statement.namedChildren[0]?.namedChildren[0]?.text ?? statement.namedChildren[0]?.text
}
