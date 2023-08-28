import { Yaml } from 'cdk8s';
import { PipelineTaskBuilder } from 'cdk8s-pipelines';
import { TektonYaml } from './tasks';

/**
 * This class handles turning a URL that points the YAML for the Tekton Hub Task into a PipelineTask
 */
export class TektonHubTask extends PipelineTaskBuilder {
  url: string;
  taskBuild: PipelineTaskBuilder;
  /**
   * Creates a new Instance of TektonHubTask with a URL that points to the Raw YAML for the task.
   * @link https://hub.tekton.dev/
   * @param url string Url to the raw yaml for a Tekton Hub Task (i.e https://raw.githubusercontent.com/tektoncd/catalog/main/task/yq/0.4/yq.yaml)
   */
  constructor(url: string) {
    super();
    this.url = url;
    this.taskBuild = new PipelineTaskBuilder();
  }
  private parseYAML(): Boolean {
    const yamlData = this.readYamlFromUrl();
    this.taskBuild.withName(yamlData.metadata.name);
    this.taskBuild.withTaskReference(yamlData.metadata.name);
    const workspaces = yamlData.spec.workspaces;
    if (workspaces !== undefined && workspaces?.length !== 0) {
      workspaces.forEach(workspace => {
        this.taskBuild.withWorkspace(workspace.name, workspace.name, workspace.description);
      });
    }
    const params = yamlData.spec.params;
    if (params !== undefined && params.length !== 0) {
      params.forEach(param => {
        this.taskBuild.withStringParam(`$(param-${param.name})`, param.name, param.default, param.default);
      });
    }
    return true;
  }
  private readYamlFromUrl(): TektonYaml {
    try {
      // Parse the YAML content
      const parsedYaml = Yaml.load(this.url);
      return parsedYaml[0];
    } catch (error) {
      const errorMessage = (error as Error).message; // Type assertion
      throw new Error(`Error reading YAML from URL: ${errorMessage}`);
    }
  }
  /**
   * Returns an instance of PipelineTaskBuilder with the corresponding Tekton Hub Task Link.
   * @returns PipelineTaskBuilder
   */
  public build(): PipelineTaskBuilder {
    this.parseYAML();
    return this.taskBuild;
  }
}