import * as fs from 'fs';
import * as path from 'path';
import { Yaml } from 'cdk8s';
import { Task } from 'cdk8s-pipelines';
import * as Handlebars from 'handlebars';
import simpleGit from 'simple-git';

/**
 * This function will take in a path name to a task YAML in the structure
 * and do its best to format the task name in a Pascal-cased class name.
 * Files such as /tasks/my-task/0.1/my-task-0.1.yaml should become
 * MyTask01.
 * @param taskPath The full path to the task YAML file.
 */
export function normalizedToPascalCase(taskPath: string): string {
  const result: string[] = [];
  const pathParts = taskPath.split(path.sep);
  // For example, /path/to/ibm-pak/1.0/ibm-pak.yml
  const nameAndVer = pathParts.slice(pathParts.length - 3, pathParts.length - 1);
  nameAndVer.forEach(p => {
    const words = p.split(/[-\.]/);
    words.forEach(w => {
      // Inspired by answer at https://stackoverflow.com/a/4068586
      result.push(w[0].toUpperCase() + w.slice(1).toLowerCase());
    });
  });
  return result.join('');
}

/**
 * Clones the given git repository into the local path.
 * @param gitUrl The URL of the git repository.
 * @param localPath The local path into which the files are cloned.
 */
function gitClone(gitUrl: string, localPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    console.info(`Cloning from ${gitUrl} into ${localPath}...`);
    // If the folder already exists, just return it...
    fs.stat(localPath, (err, stats) => {
      if (!err && stats.isDirectory()) {
        console.debug(`Cached tasks found at ${localPath}, using...`);
        resolve(localPath);
      } else {
        // create the directory
        console.debug(`No cached tasks found at ${localPath}, cloning from git ${gitUrl}`);
        simpleGit().clone(gitUrl, localPath)
          .then(() => {
            resolve(localPath);
          })
          .catch((e) => {
            reject(e.message);
          });
      }
    });
  });
}

/**
 * Gets the task directories under the given base directory.
 * @param basedir The base directory.
 * @return Promise including an array of the task directories.
 */
function getTaskDirs(basedir: string): Promise<string[]> {
  const tasksDir = path.join(basedir, 'tasks');
  return new Promise((resolve, reject) => {
    console.info(`Getting tasks from dir ${tasksDir}...`);
    const dirs: string[] = [];
    fs.readdir(tasksDir, (err: NodeJS.ErrnoException | null, files: string[]) => {
      if (err) {
        reject(() => {
          return new Error(err.message);
        });
      }
      files.forEach((f) => {
        const taskFullPath = path.join(tasksDir, f);
        if (fs.statSync(taskFullPath).isDirectory()) {
          dirs.push(taskFullPath);
        }
      });
      resolve(dirs);
    });
  });
}

/**
 * Gets the version directories, which are subdirectories of the task directories.
 * @param taskDirs A string array containing all the full paths to the version directories.
 */
function getVersionDirs(task: string): Promise<string[]> {
  const regexp = new RegExp('^[0-9]+\.[0-9]$');
  const allVerDirs: string[] = [];
  return new Promise((resolve, reject) => {
    console.debug(`Getting versions from task ${task}...`);
    fs.readdir(task, (err: NodeJS.ErrnoException | null, files: string[]) => {
      // TODO: Make sure the format of the version directory matches symantec versioning
      if (err) {
        reject(() => {
          return new Error(err.message);
        });
      }
      files.forEach(verF => {
        const verPath = path.join(task, verF);
        const stats = fs.statSync(verPath);
        if (stats.isDirectory() && regexp.test(verF)) {
          allVerDirs.push(verPath);
        }
      });
      resolve(allVerDirs);
    });
  });
}

/**
 * TaskInfo contains more than just that task.
 */
class TaskInfo {
  task: Task;
  className: string;

  public constructor(className: string, task: Task) {
    this.className = className;
    this.task = task;
  }
}

/**
 * Loads the YAML files into Tasks and returns the array of Tasks.
 * @param paths The string full path names of the YAML files that contain the tasks.
 * @return Promise of an array of Task
 */
function loadTaskYamls(paths: string[]): Promise<TaskInfo[]> {
  return new Promise((resolve, reject) => {
    const tasks: TaskInfo[] = [];
    paths.forEach((p) => {
      try {
        const fn = firstYamlFileIn(p);
        console.debug(`Trying to load task from YAML in ${fn}...`);
        const t = Yaml.load(fn);
        const task = t[0] as Task;
        const taskClassName = normalizedToPascalCase(fn);
        const info = new TaskInfo(taskClassName, task);
        tasks.push(info);
      } catch (e) {
        const msg = (e as Error).message;
        reject(`Error loading YAML from file ${p}: ${msg}`);
      }
    });
    resolve(tasks);
  });
}

function firstYamlFileIn(dir: string): string {
  const files = fs.readdirSync(dir);
  let result = '';
  files.forEach((fn) => {
    const fp = path.join(dir, fn);
    if (fs.statSync(fp).isFile() && path.extname(fp) === '.yaml') {
      // processing the correct YAML file now...
      result = path.join(dir, fn);
      return;
    }
    return;
  });
  return result;
}

/**
 * Writes the Tasks as TaskBuilder classes using the provided template into the
 * provided output file.
 * @param tasks The array of Tasks to write.
 * @param template The template file that is used to generate the TaskBuilder class code.
 * @param outputFile The name of the generated file into which output is written.
 */
function writeClasses(tasks: TaskInfo[], template: any, outputFile: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    tasks.forEach((taskInfo) => {
      // TODO: Make sure to replace this with the PascalCase version
      const context = {
        normalizedTaskName: taskInfo.className,
        task: taskInfo.task,
      };
      fs.appendFile(outputFile, template(context).toString() + '\n', {
        encoding: 'utf8',
      }, () => {
        resolve(true);
      });
    });
    resolve(true);
  });
};

function initializeTemplate(templateFile: string) {
  const templateData = fs.readFileSync(templateFile, 'utf8');
  if (!templateData) {
    throw new Error(`Could not load data from template file: ${templateFile}`);
  }
  Handlebars.registerHelper('variableEscape', (str) => {
    if (!str) {
      return;
    }
    return str.replace(/\${/g, '\\${').replace(/\`/g, '\\\`');
  });
  const template = Handlebars.compile(templateData);
  return template;
}

function writeFileHeader(outputFile: string): boolean {
  const fileImports: string[] = [];
  // fileImports.push('/* eslint-disable */');
  fileImports.push('/* this file is generated during the npx projen build process */');
  fileImports.push('import { ParameterBuilder, TaskBuilder, TaskStepBuilder, WorkspaceBuilder } from \'cdk8s-pipelines\';');
  fileImports.push('import { Construct } from \'constructs\';');
  fileImports.push('');
  try {
    fs.writeFileSync(outputFile, fileImports.join('\n'), {
      encoding: 'utf8',
    });
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/**
 * Generates the deployer tasks from the GitHub location into a local file that
 * includes each task as a class that extends TaskBuilder.
 */
export function generateDeployerTasks() {
  const gitUrl = 'https://github.com/cloud-native-toolkit/deployer-tekton-tasks.git';
  const cacheDir = path.join(__dirname, '..', '..', 'cache');
  const outputFile = path.join(__dirname, 'generatedDeployerTasks.ts');
  const templateFile = path.join(__dirname, 'taskbuilder.hbt');

  const template = initializeTemplate(templateFile);

  if (writeFileHeader(outputFile)) {
    gitClone(gitUrl, cacheDir)
      .then(getTaskDirs)
      .then((taskDirs: string[]) => {
        taskDirs.forEach((t) => {
          getVersionDirs(t)
            .then(loadTaskYamls)
            .then((tasks) => {
              writeClasses(tasks, template, outputFile)
                .then((result) => {
                  if (!result) {
                    console.error('Failed!');
                  }
                })
                .catch(() => {
                  console.log('Failed!');
                });
            })
            .catch(() => {
              console.error('Failed!');
            });
        });
      })
      .catch((error) => {
        console.error(error);
      });
  }
}
