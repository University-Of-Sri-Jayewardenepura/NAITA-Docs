let prompt = '';
for await (const chunk of process.stdin) prompt += chunk;
if (process.argv[2] === 'fail') {
  console.error('Deliberate test agent failure');
  process.exitCode = 1;
} else if (process.argv[2] === 'malformed') {
  console.log('This is not a JSON response.');
} else {
  const weeks = JSON.parse(prompt.split('Source material:\n')[1]);
  const week = weeks[0];
  const commit = week.days.flatMap((day) => day.commits)[0];
  await new Promise((accept) => setTimeout(accept, 50));
  console.log(
    JSON.stringify({
      weeks: [
        {
          monday: week.monday,
          suggestions: [
            {
              section: 'work',
              kind: 'draft',
              text: 'Added a task search box.',
              reason: 'The commit records search by title.',
              evidence: [commit.hash],
            },
          ],
        },
      ],
    }),
  );
}
