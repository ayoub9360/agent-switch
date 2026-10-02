// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vitest"
import { ContentDiff } from "./content-diff"

afterEach(cleanup)

it("colors only changed lines and keeps shared context once", () => {
  render(
    <ContentDiff before={"first\nold\nlast\n"} after={"first\nnew\nlast\n"} />
  )
  expect(screen.getByText("old").parentElement).toHaveClass("removed")
  expect(screen.getByText("new").parentElement).toHaveClass("added")
  expect(screen.getAllByText("first")).toHaveLength(1)
  expect(screen.getByText("last").parentElement).toHaveClass("context")
  expect(screen.getByText("last").parentElement).toHaveTextContent("33")
})

it("limits context around distant changes", () => {
  const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
  const updated = [...lines]
  updated[2] = "first change"
  updated[25] = "second change"
  const { container } = render(
    <ContentDiff before={lines.join("\n")} after={updated.join("\n")} />
  )
  expect(container.querySelectorAll(".diff-hunk")).toHaveLength(2)
  expect(screen.queryByText("line 15")).not.toBeInTheDocument()
  expect(screen.getByText("line 6")).toBeInTheDocument()
  expect(screen.queryByText("line 7")).not.toBeInTheDocument()
})

it.each([
  ["", "new\n", "added"],
  ["old\n", "", "removed"],
])("handles file additions and deletions", (before, after, kind) => {
  const { container } = render(<ContentDiff before={before} after={after} />)
  expect(container.querySelectorAll(`.diff-code-line.${kind}`)).toHaveLength(1)
  expect(container.querySelector(".context")).toBeNull()
})

it("shows changes to the final newline", () => {
  render(<ContentDiff before="same" after={"same\n"} />)
  expect(
    screen.getByText("No newline at end of file").parentElement
  ).toHaveClass("note")
})

it("does not render differences for identical content", () => {
  const { container } = render(<ContentDiff before="same" after="same" />)
  expect(container.querySelector(".diff-code-line")).toBeNull()
})
