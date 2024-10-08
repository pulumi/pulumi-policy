# Contributing

## Changelog

The changelog in this repo is managed manually in the `CHANGELOG.md` file.
PRs with a notable change should include an entry in the `HEAD (Unreleased)`
section of the file.

## Releasing

To release a new version of `pulumi-policy`, update the `CHANGELOG.md` file,
moving all items from the `HEAD (Unreleased)` section to a new section with
the new version number. Once this is merged, a new version will be published
when a tag of the form `v*.*.*` is pushed to the repo. To push the tag,
ask the `@release-bot` in the internal Pulumi Slack channel `#release-ops`
to do a release, for example:

```
@release-bot release pulumi-policy minor
```
