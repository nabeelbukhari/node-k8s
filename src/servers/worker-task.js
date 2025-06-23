const { lightWorkload, heavyWorkload } = require('./workloads');

module.exports = async function (task) {
  if (task === 'light') {
    return await lightWorkload();
  } else if (task === 'heavy') {
    return await heavyWorkload();
  } else {
    throw new Error('Unknown task type: ' + task);
  }
};
