# AI tools used during development

| Tool | Used for |
| --- | --- |
| Claude (Anthropic) via Claude Code | Requirements analysis, planning document, scaffolding, writing most of the application code, tests, and this documentation, working from the brief under human direction |
| Google Gemini 2.5 Flash | The runtime model inside the product, for intent classification and grounded answering. Not used to write code |

How the work was directed: the brief was decomposed line by line into a requirements and plan document first. The backend was built against a mocked model and a full test suite before any real model call was wired in. Every generated file was run through the type checker, linter, unit tests, and a browser end-to-end test; failures were fixed iteratively. Product and engineering decisions in `decisions.md` were made by the author and are defensible independent of the tooling.
