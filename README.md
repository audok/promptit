<p align="right">English | <a href="README.ko.md">한국어</a></p>

# promptit

promptit is a Chromium browser extension that lets you quickly open saved prompts by typing `/ ` in ChatGPT and Gemini input fields.

Save frequently used prompts on the options page, then insert or copy them directly on [ChatGPT](https://chatgpt.com/) and [Gemini](https://gemini.google.com/).

## Supported Sites
- [ChatGPT](https://chatgpt.com/)
- [Gemini](https://gemini.google.com/)

## Features
- Open the saved prompt list with the `/` `space` trigger (`slash` + `space`)
- Insert the selected prompt into the current input field
- Copy the selected prompt to the clipboard

## Installation
### Method 1. Download from GitHub Releases
Use this method if you do not want to set up a development environment.

1. Download `promptit_v1.0.0.zip` [here](https://github.com/audok/promptit/releases).

2. Extract the downloaded zip file.

3. Open the extensions management page in Chrome or a Chromium-based browser.

4. Turn on Developer mode.

5. Click `Load unpacked`.

6. Select the extracted folder.

> To update to a new version, repeat the steps above.

### Method 2. Build It Yourself
This project uses `pnpm@10.33.0`.

1. Clone the repository.
   ```bash
   git clone https://github.com/audok/promptit.git
   cd promptit
   ```

2. Install dependencies.
   ```bash
   pnpm install
   ```

3. Build the extension.
   ```bash
   pnpm build
   ```

4. Open the extensions management page in Chrome or a Chromium-based browser.

5. Turn on Developer mode.

6. Click `Load unpacked`.

7. Select the generated `dist/` folder.

> To update to a new version, repeat the steps above.

## Usage
1. Click the promptit extension icon in the browser toolbar to open the options page.
2. Enter a title and body to save a prompt.
3. Type `/` `space` in a ChatGPT or Gemini input field to open the promptit popup.
4. Select a prompt to insert it into the input field or copy it.

You can use the popup with a mouse, or with the arrow keys and `Enter`.
Press `Esc` or `Backspace` to close the popup and remove the `/ ` trigger you typed.

If you do not have any saved prompts, you can open the options page from the popup and add your first prompt.

## Troubleshooting
If the popup does not open, check the following:
1. Make sure the current page is a supported site.
2. Make sure you typed `/` `space`, including `space` after the slash, instead of only `/`.
3. If you do not have any prompts, add one from the options page first.
4. Make sure the extension is loaded in your browser.

## License
[GPL-3.0](LICENSE)
