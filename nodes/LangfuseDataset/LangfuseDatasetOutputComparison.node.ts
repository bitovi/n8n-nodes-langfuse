import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from 'n8n-workflow';
import { Langfuse as LangfuseCreate } from 'langfuse';

const LOG_NAME = 'LangfuseDatasetOutputComparison';

export class LangfuseDatasetOutputComparison implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Dataset Output Comparison',
		name: 'LangfuseDatasetOutputComparison',
		icon: 'file:langfuse.svg',
		group: ['transform'],
		version: 1,
		description: "Compare specific workflow's Langfuse dataset outputs with expected outputs and score the run",
		defaults: {
			name: 'LangfuseDatasetOutputComparison',
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
						name: 'Langfuse Dataset Output Comparison',
						value: 'LangfuseDatasetOutputComparison',
					},
				],
				default: 'LangfuseDatasetOutputComparison',
			},
			{
				displayName: 'Dataset Data',
				name: 'datasetData',
				type: 'json',
				default: '{}',
				required: true,
				description: 'The dataset data from the LangfuseDatasetInputs custom node',
			},
			{
				displayName: 'LLM Output',
				name: 'llmOutput',
				type: 'string',
				default: '',
				required: true,
				description: 'The output received from the LLM',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const inputs = this.getInputData();
		var returnData: INodeExecutionData[] = [];
		for (let i = 0; i < inputs.length; i++) {
			try {
				console.log(`[${LOG_NAME}] Initializing Langfuse...`);
				const langfuse = new LangfuseCreate({
					publicKey: process.env.LANGFUSE_PUBLIC_KEY,
					secretKey: process.env.LANGFUSE_SECRET_KEY,
					baseUrl: process.env.LANGFUSE_HOST,
				});
				
				const datasetData = this.getNodeParameter('datasetData',i) as INodeExecutionData;
				const chatOutput = this.getNodeParameter('llmOutput',i) as string;

				returnData = await compareDatasetOutputs(this, langfuse, datasetData, chatOutput);

				console.log(`[${LOG_NAME}] Flushing Langfuse...`);
				await langfuse.flushAsync();
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
		}
		return [returnData];
	}
}

async function compareDatasetOutputs(
	executeFuncs: IExecuteFunctions,
	langfuse: LangfuseCreate,
	datasetInput: INodeExecutionData,
	chatOutput: string
) {
	const returnCompares: INodeExecutionData[] = [];

	try {
		console.log(`[${LOG_NAME}] Initializing parameter variables...`);
		const output = chatOutput as string;
		const traceId = datasetInput.json.traceId as string;
		const spanId = datasetInput.json.spanId as string;
		const runName = datasetInput.json.runName as string;
		const itemId = datasetInput.json.itemId as string;

		const trace = langfuse.trace({ id: traceId });
		if (!trace) {
			console.log(`[${LOG_NAME}] Trace with ID ${traceId} for dataset item ${itemId} not found.`);
		} else {
			const endTime = new Date().toISOString();
			console.log(`[${LOG_NAME}] Updating trace for dataset item ${itemId} ...`);
			await trace.update({ 
				output,
				metadata: {
					endTime: endTime,
					runName,
					itemId
				} 
			});
			const span = trace.span({ id: spanId });
			if(!span){
				console.log(`[${LOG_NAME}] Span with ID ${spanId} for dataset item ${itemId} not found.`);
			} else {
				console.log(`[${LOG_NAME}] Completing span for dataset item ${itemId} ...`);
				await span.update({
					output,
					metadata: {
						endTime: endTime,
						runName,
						itemId
					} 
				});
				await span.end();
			}
		}
		
	} catch (error) {
		if (executeFuncs.continueOnFail()) {
			returnCompares.push({
				json: {
					error: error.message,
				},
			});
		} else {
			console.error(`[${LOG_NAME}] Error: ${error}`);
			throw error;
		}
	}

	return returnCompares;
}