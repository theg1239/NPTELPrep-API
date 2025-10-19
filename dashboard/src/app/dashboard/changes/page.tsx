import { TuiPanel } from "@/components/tui/components";
import { getStagedChanges } from "@/lib/staged-changes";
import type { ChangeOperation } from "@/lib/staged-changes";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const summarize = (text: string, max = 54) => {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
};

const describeOperation = (operation: ChangeOperation): string => {
  switch (operation.type) {
    case "update_question_text":
      return `Set question ${operation.questionId} text to "${operation.newText}"`;
    case "update_correct_option":
      return `Set question ${operation.questionId} correct option to ${operation.newCorrectOption.toUpperCase()}`;
    case "upsert_option":
      return `Upsert option ${operation.optionNumber.toUpperCase()} for question ${operation.questionId}`;
    case "delete_option":
      return `Delete option ${operation.optionNumber.toUpperCase()} for question ${operation.questionId}`;
    case "create_question":
      return `Create question ${operation.questionNumber} in assignment ${operation.assignmentId} (correct option ${operation.correctOption.toUpperCase()}, ${operation.options.length} options)`;
    case "delete_question": {
      const safety = operation.ensureMinimumQuestions
        ? ` (keep ≥ ${operation.ensureMinimumQuestions} questions)`
        : "";
      return `Delete question ${operation.questionId} from assignment ${operation.assignmentId}${safety}`;
    }
    case "set_question_number":
      return `Renumber question ${operation.questionId} to ${operation.newQuestionNumber}`;
    case "update_assignment_title":
      return `Rename assignment ${operation.assignmentId} to "${operation.newTitle}"`;
    case "update_assignment_week":
      return `Set assignment ${operation.assignmentId} week to ${operation.newWeekNumber}`;
    default:
      return JSON.stringify(operation);
  }
};

export default async function ChangesPage() {
  const changes = await getStagedChanges();
  const totalOperations = changes.reduce(
    (sum, change) => sum + change.operations.length,
    0
  );
  const uniqueCourses = new Set(changes.map((change) => change.courseCode));
  const latestChange = changes[0];

  const groupedByCourse = Array.from(uniqueCourses).map((courseCode) => {
    const courseChanges = changes.filter(
      (change) => change.courseCode === courseCode
    );
    return {
      courseCode,
      count: courseChanges.length,
      latest:
        courseChanges.length > 0
          ? courseChanges[0].createdAt
          : new Date(0).toISOString(),
    };
  });

  return (
    <div className="tui-content-mobile text-tui-white pb-10 md:pb-0 space-y-4">
      <div className="border-b border-tui-blue text-sm mb-2 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">changes.json</span>
          <span className="text-tui-gray ml-2">[readonly]</span>
        </div>
        <div className="text-tui-gray">
          {new Date().toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TuiPanel title="Change Summary" color="cyan">
          <div className="px-3 py-2 text-sm space-y-2">
            <div className="flex justify-between">
              <span>Total proposals</span>
              <span className="text-tui-green">{changes.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Unique courses</span>
              <span className="text-tui-yellow">{uniqueCourses.size}</span>
            </div>
            <div className="flex justify-between">
              <span>Total operations</span>
              <span className="text-tui-magenta">{totalOperations}</span>
            </div>
            <div className="flex justify-between">
              <span>Latest update</span>
              <span className="text-tui-gray">
                {latestChange ? formatDate(latestChange.createdAt) : "—"}
              </span>
            </div>
          </div>
        </TuiPanel>

        <TuiPanel title="Course Focus" color="green">
          <div className="px-3 py-2 text-sm space-y-1">
            {groupedByCourse.length > 0 ? (
              groupedByCourse
                .sort((a, b) => b.count - a.count)
                .slice(0, 5)
                .map((group) => (
                  <div
                    key={group.courseCode}
                    className="flex items-center justify-between border-b border-tui-gray/40 py-1"
                  >
                    <div>
                      <span className="text-tui-cyan font-mono">
                        {group.courseCode}
                      </span>
                      <span className="text-tui-gray ml-2 text-xs">
                        {formatDate(group.latest)}
                      </span>
                    </div>
                    <span className="text-tui-yellow">{group.count}</span>
                  </div>
                ))
            ) : (
              <p className="text-xs text-tui-gray py-2">
                No staged changes yet. Agent proposals will appear here.
              </p>
            )}
          </div>
        </TuiPanel>

        <TuiPanel title="Review Checklist" color="blue">
          <div className="px-3 py-2 text-sm space-y-2">
            <p className="text-xs text-tui-gray leading-5">
              Use this queue to verify agent suggestions before applying them to
              production data. Confirm question text, correct options, and SQL
              safety for each proposal.
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Compare with source course material.</li>
              <li>Validate SQL updates against a staging database.</li>
              <li>Record any manual adjustments or rejections.</li>
            </ul>
          </div>
        </TuiPanel>
      </div>

      <div>
        <TuiPanel
          title={`Queued Changes (${changes.length})`}
          color="yellow"
          collapsible
        >
          {changes.length === 0 ? (
            <div className="px-3 py-4 text-sm text-tui-gray">
              No staged changes were found in the agent queue.
            </div>
          ) : (
            <div className="px-1 py-2 space-y-3">
              {changes.map((change) => (
                <div
                  key={change.id}
                  className="border border-tui-gray/50 bg-black/40 p-3 font-mono text-xs md:text-sm"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-tui-cyan uppercase tracking-wide text-xs">
                        Course {change.courseCode}
                      </div>
                      <div className="text-tui-white text-base md:text-lg">
                        {change.issueSummary}
                      </div>
                    </div>
                    <div className="text-right md:text-left text-tui-gray text-xs whitespace-nowrap">
                      <div>{formatDate(change.createdAt)}</div>
                      {change.reporter && (
                        <div className="text-tui-blue">
                          by {change.reporter}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-3 leading-relaxed text-sm">
                    <div>
                      <div className="text-tui-yellow uppercase text-xs tracking-wide mb-1">
                        Recommended action
                      </div>
                      <p className="text-tui-white/90 whitespace-pre-wrap">
                        {change.recommendedFix}
                      </p>
                    </div>

                    {change.operations.length > 0 && (
                      <div>
                        <div className="text-tui-yellow uppercase text-xs tracking-wide mb-1">
                          Operations
                        </div>
                        <div className="bg-black/60 border border-tui-gray/60 rounded-sm overflow-hidden">
                          <ol className="list-decimal list-inside divide-y divide-tui-gray/40">
                            {change.operations.map((operation, index) => (
                              <li
                                key={index}
                                className="px-3 py-2 text-tui-green whitespace-pre-wrap break-words"
                              >
                                {describeOperation(operation)}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}
                    {change.legacySqlStatements.length > 0 && (
                      <div className="mt-3 text-xs text-tui-red space-y-1">
                        <div className="uppercase tracking-wide">
                          Legacy SQL Statements (manual migration required)
                        </div>
                        <ul className="list-disc list-inside space-y-1">
                          {change.legacySqlStatements.map((statement, idx) => (
                            <li key={idx} className="whitespace-pre-wrap">
                              {statement}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {change.supportingNotes.length > 0 && (
                      <div>
                        <div className="text-tui-yellow uppercase text-xs tracking-wide mb-1">
                          Supporting notes
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-tui-gray">
                          {change.supportingNotes.map((note, index) => (
                            <li key={index} className="whitespace-pre-wrap">
                              {note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="text-tui-gray/70 text-xs">
                      Source file: {summarize(change.fileName, 64)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TuiPanel>
      </div>
    </div>
  );
}
