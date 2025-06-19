import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType
} from 'n8n-workflow';
import { ApiDatasetItem, Langfuse as LangfuseCreate } from 'langfuse';

const LOG_NAME = "LangfuseDatasetInputs";

export class LangfuseDatasetInputs implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'LangfuseDatasetInputs',
		name: 'langfuseDatasetInputs',
		icon: 'file:langfuse.svg',
		group: ['transform'],
		version: 1,
		description: 'Grab specific workflow\'s Langfuse dataset inputs to run',
		defaults: {
			name: 'LangfuseDatasetInputs',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				options: [
					{
						name: 'Langfuse Dataset Inputs',
						value: 'langfuseDatasetInputs',
					},
				],
				default: 'langfuseDatasetInputs',
			}
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		var returnData: INodeExecutionData[] = [];

		try {
			const workflowName = this.getWorkflow().name as string;

			console.log(`[${LOG_NAME}] Initializing Langfuse...`);
			const langfuse = new LangfuseCreate({
				publicKey: process.env.LANGFUSE_PUBLIC_KEY,
				secretKey: process.env.LANGFUSE_SECRET_KEY,
				baseUrl: process.env.LANGFUSE_HOST,
			});

			returnData = await getDatasetInputs(this, langfuse, workflowName);
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({
					json: {
						error: error.message,
					},
				});
			} else {
				throw error;
			}
		}
		return [returnData];
	}
}

async function getDatasetInputs(executeFuncs: IExecuteFunctions, langfuse: LangfuseCreate, workflowName: string) {
	const returnInputs: INodeExecutionData[] = [];

	try{
		const workflowSlug = workflowName.trim().toLowerCase().replace(/\s+/g, '-');

		console.log(`[${LOG_NAME}] Gathering ${workflowName} workflow's dataset inputs...`);
		const dataset = await langfuse.getDataset(`dataset-${workflowSlug}`);
		console.log(`[${LOG_NAME}] Dataset ${dataset.name} gathered.`);

		for(const datasetItem in dataset.items){
			const item = datasetItem as unknown as ApiDatasetItem;
			if (item.status == 'ACTIVE') {
				console.log(`[${LOG_NAME}] Retrieved ${item.status} Dataset Item: ${item.id}`);
				returnInputs.push({ json: { input: item.input, itemId: item.id }});
			} else {
				console.log(`[${LOG_NAME}] Dataset Item ${item.id} is ${item.status}`);
			}
		}
	}
	catch (error) {
		if (error.message.includes('not found') || error.status === 404) {
			console.error(`[${LOG_NAME}] Dataset for ${workflowName} workflow does not exist`);
			// create new? create a defaut LLM dataset to use?
			returnInputs.push({
				json: {
					error: `Dataset for ${workflowName} workflow does not exist`,
				},
			});
		} else {
			if (executeFuncs.continueOnFail()) {
				returnInputs.push({
					json: {
						error: error.message,
					},
				});
			} else {
				console.error(`[${LOG_NAME}] Error: ${error}`);
				throw error;
			}
		}
	}
	
	return returnInputs;
}
