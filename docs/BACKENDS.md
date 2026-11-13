# Backends

Ega sends each request to a backend you choose: ten cloud providers, two kinds of local server, and a
bridge to a `claude` or `codex` CLI you already have. Set them up in Settings → **Backends**.

| Backend             | Kind                                    | What it needs                             | Images        |
| ------------------- | --------------------------------------- | ----------------------------------------- | ------------- |
| Anthropic           | Cloud                                   | An API key                                | Yes           |
| OpenAI              | Cloud                                   | An API key                                | Yes           |
| Google Gemini       | Cloud                                   | An API key                                | Yes           |
| OpenRouter          | Cloud                                   | An API key                                | Yes           |
| Groq                | Cloud                                   | An API key                                | No            |
| DeepSeek            | Cloud                                   | An API key                                | No            |
| Together            | Cloud                                   | An API key                                | No            |
| Mistral             | Cloud                                   | An API key                                | No            |
| xAI                 | Cloud                                   | An API key                                | No            |
| Fireworks           | Cloud                                   | An API key                                | No            |
| Ollama              | Local; a cloud model runs on ollama.com | A daemon on loopback + `ollama pull`      | Vision models |
| Local server        | Local: LM Studio or llama-server        | The server running on loopback, no key    | Vision models |
| `claude` or `codex` | Existing CLI                            | The CLI installed and the host registered | Yes           |

- **Which start enabled:** Anthropic, Gemini and the native host. Every other provider is never
  called until you press **Enable** on its card.
- **Verified:** a cloud provider's card reads "Key saved" until you press **Test** and the test
  passes. Then it reads "Verified". A new key or model clears it.
- **Images** skip every backend that cannot read them. On a right-click image with no image-capable
  backend, Ega stops and says so.
- **The `claude` or `codex` CLI** answers through your existing login. Set it up with
  [`INSTALL_NATIVE_HOST.md`](INSTALL_NATIVE_HOST.md).
