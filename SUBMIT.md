# Submission status

## What is already done

1. Index has been built. `data/` and `corpus/` are populated.
2. Local git repo is initialized and committed.
3. Public GitHub repo is created at https://github.com/PaulSemaan007/gutensearch
4. GitHub Pages is enabled. Live demo URL is **https://paulsemaan007.github.io/gutensearch/**
5. Live URL is already on slide 13 of the presentation.

## What you still need to do

### Submit to GitHub Classroom for grading

The personal repo above is for the live demo. The Classroom repo is what gets graded. Steps below.

1. Open https://classroom.github.com/a/vz61SjkM in a browser and accept the assignment. GitHub will create a private repo under your account under the class organization. Copy that repo URL.

2. In a terminal in this folder, run

```
git remote add classroom <THE_URL_FROM_STEP_1>
git push classroom main
```

If push fails because the Classroom repo has a starter commit you do not have, run

```
git pull classroom main --allow-unrelated-histories
git push classroom main
```

3. Confirm in the Classroom repo on github.com that all the files are there.

### Day of presentation

1. Open `Project_2_Slides.html` on the projector. Hit F11 for fullscreen.
2. Open `Project_2_Script.html` on your phone or laptop.
3. Read the script while clicking through the slides with the right arrow.
4. On the last content slide, switch to https://paulsemaan007.github.io/gutensearch/ in another browser tab and run two or three queries live. Examples
   - `vampire blood transylvania`
   - `"mr darcy"`
   - `monst*`
   - `frankinstien` (shows spell correction)
5. Take questions.

## Useful query examples for the demo

| Query | Expected behavior |
|-------|-------------------|
| `vampire blood transylvania` | Ranked, Dracula at the top |
| `"mr darcy"` | Phrase, Pride and Prejudice only |
| `monst*` | Wildcard, expands to monster, monsters, monstrous, monstrosity |
| `darcy AND elizabeth AND NOT bingley` | Boolean |
| `frankinstien` | Spell correction suggests frankenstein |
| `scrooge christmas` | Ranked, A Christmas Carol at the top |
