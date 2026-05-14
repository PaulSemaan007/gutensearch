# How to submit and deploy

This is a short checklist for getting Project 2 turned in. Estimated time, around 15 minutes.

## 1. Build and test locally first

Open a terminal in this folder and run

```
python build_index.py
```

You should see ten lines like `processing 1342 Pride and Prejudice` and finish with a summary that says something like "wrote data/index.json, 10 documents, ~760,000 tokens".

Now start a local server.

```
python -m http.server 8000
```

Open `http://localhost:8000/` in a browser. Try these queries to confirm everything works.

- `vampire blood transylvania` (should rank Dracula first)
- `"mr darcy"` (Pride and Prejudice)
- `monst*` (a few books)
- `darcy AND elizabeth AND NOT bingley` (Pride and Prejudice)
- `frankinstien` (should suggest frankenstein)

Stop the server with Ctrl-C when done.

## 2. Accept the GitHub Classroom assignment

Go to `https://classroom.github.com/a/vz61SjkM` and accept the assignment. It creates a repository under your GitHub account. Copy the repo URL it gives you.

## 3. Push the code

In this folder, run the following. Replace `YOUR_REPO_URL` with the URL from step 2.

```
git init
git add .
git commit -m "GutenSearch, CECS 429 Project 2"
git branch -M main
git remote add origin YOUR_REPO_URL
git push -u origin main
```

If git complains that the remote already has commits (because GitHub Classroom added a starter file), instead run

```
git pull origin main --allow-unrelated-histories
git push -u origin main
```

## 4. Enable GitHub Pages for the bonus 5 points

On the repo page on github.com, click Settings, then Pages in the left sidebar. Set Source to "Deploy from a branch", Branch to `main`, Folder to `/ (root)`. Click Save. Wait around 60 seconds. The page will refresh with a live URL near the top, something like `https://YOURNAME.github.io/REPO_NAME/`.

Open that URL in a new tab. The first load takes a few seconds because the index JSON is around 30 MB. After that it is cached and fast.

## 5. Add the live URL to the slides

Open `Project_2_Slides.html` in a text editor. Find the line that says

```
SIGIR Demonstrations Track
```

and add the live URL right under it on the same slide. Save the file. Re-push.

```
git add Project_2_Slides.html
git commit -m "Add live demo URL"
git push
```

## 6. Day of presentation

Open `Project_2_Slides.html` on the projector, hit F11 for fullscreen. Open `Project_2_Script.html` on your phone or laptop. Read straight off the script while clicking through the slides with the right arrow key. They are aligned one to one.

On the last content slide before the thank you, switch to the live demo URL in another browser tab and run two or three of the queries from step 1. Then take questions.

## Files to make sure are in the repo

- `index.html`, `app.js`, `style.css`
- `build_index.py`
- `Project_2_Report.html`
- `Project_2_Slides.html`
- `Project_2_Script.html`
- `README.md`
- `requirements.txt`
- `.gitignore`
- `data/` and `corpus/` are populated by build_index.py

The `corpus/` folder has the raw book downloads, around 5 MB. The `data/` folder has the built index, around 35 MB. Both should be committed since GitHub Pages needs them at the deployed URL.
