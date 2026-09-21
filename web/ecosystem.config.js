module.exports = {
  apps: [
    {
      name: 'family-web',
      script: 'npm',
      args: 'run start',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '150M',
    },
  ],
};
