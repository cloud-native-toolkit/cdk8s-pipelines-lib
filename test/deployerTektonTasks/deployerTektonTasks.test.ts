import { normalizedToPascalCase } from '../../src/deployerTektonTasks/DeployerTaskGenerator';

describe('testDeployerTektonTasks', () => {

  test('', async () => {

  });

  test('testNormalizedName', async () => {
    const fileName = '/Users/jexample/Code/cloud-native-toolkit/cdk8s-pipelines-libcache/tasks/ibm-pak/0.2/ibm-pak.yaml';
    const normalizedClassName = normalizedToPascalCase(fileName);
    expect(normalizedClassName).toBe('IbmPak02');
  });

  test('testGenerateDeployTasksHappyPath', async () => {
    // generateDeployerTasks();
  });
});