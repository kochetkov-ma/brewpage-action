## Publish to BrewPage __TAG__

Marketplace: https://github.com/marketplace/actions/publish-to-brewpage

### Quick start

```yaml
- uses: kochetkov-ma/brewpage-action@__TAG__
  id: publish
  with:
    path: ./report.html
- run: echo "${{ steps.publish.outputs.url }}"
```

Full inputs/outputs, redeploy flow and examples -> [README](https://github.com/kochetkov-ma/brewpage-action#readme)

---
