import { useMemo } from "react"
import { structuredPatch } from "diff"

export function ContentDiff({
  before,
  after,
}: {
  before: string
  after: string
}) {
  const hunks = useMemo(
    () =>
      structuredPatch("", "", before, after, undefined, undefined, {
        context: 3,
      }).hunks,
    [before, after]
  )

  return (
    <div className="diff-content" aria-label="Content differences">
      {hunks.map((hunk, index) => {
        let oldLine = hunk.oldStart
        let newLine = hunk.newStart
        return (
          <div key={index}>
            <div className="diff-hunk">
              {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
            </div>
            {hunk.lines.map((line, lineIndex) => {
              const marker = line[0]
              const kind =
                marker === "+"
                  ? "added"
                  : marker === "-"
                    ? "removed"
                    : marker === "\\"
                      ? "note"
                      : "context"
              const oldNumber =
                kind === "context" || kind === "removed" ? oldLine++ : ""
              const newNumber =
                kind === "context" || kind === "added" ? newLine++ : ""
              return (
                <div className={`diff-code-line ${kind}`} key={lineIndex}>
                  <span className="diff-line-number" aria-hidden="true">
                    {oldNumber}
                  </span>
                  <span className="diff-line-number" aria-hidden="true">
                    {newNumber}
                  </span>
                  <span className="diff-marker" aria-hidden="true">
                    {marker}
                  </span>
                  <code>{line.slice(1)}</code>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
