class CustomReporter {
  constructor() {
    this.printed = false;
  }

  onRunComplete(contexts, results) {
    if (!this.printed) {
      console.log('\nTest Results:\n');
      const stdout = results.testResults[0].console
        .filter(entry => entry.type === 'stdout')
        .map(entry => entry.message)
        .join('\n');
      console.log(stdout);
      this.printed = true;
    }
  }
}

module.exports = CustomReporter;