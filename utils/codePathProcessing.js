// 手动定义当前文件的相对路径
const ROOT_TO_THIS_FILE_PATH = "./utils/utility.js";

export function getRelativePositionOfCurrentCode(deep = 1) {
	const currentFileAbsolutePath = getStackTracePath(0);
	// 从堆栈中获取使用此函数的文件名和行号
	const targetAbsolutePath = getStackTracePath(deep);

	// 使用正则表达式移除 targetAbsolutePath 末尾的 :行号:列号 部分
	const cleanTargetAbsolutePath = targetAbsolutePath.replace(
		/:(\d+):(\d+)$/,
		""
	);

	// 获取根目录绝对路径
	const rootDirectoryAbsolutePath = getRootDirectoryAbsolutePath(
		currentFileAbsolutePath
	);
	const targetBiasWithRoot = compareRelativePath(
		rootDirectoryAbsolutePath,
		targetAbsolutePath
	); // 仍然使用包含行号的 targetAbsolutePath 来计算相对路径
	// 获取目标文件代码在文件中的位置
	const targetCodePosition = getTargetCodePosition(targetAbsolutePath);

	const r = {
		codeAbsolutePath: targetAbsolutePath, // 使用清理后的绝对路径
		codeFileAbsolutePath: cleanTargetAbsolutePath, // 使用清理后的绝对路径
		codeFileRelativePathWithRoot: `./${targetBiasWithRoot}`,
		codePositionInFile: targetCodePosition,
	};
	// debugLog(r);

	return r;
}

export function getTargetCodePosition(absoluteFilePath) {
	if (!absoluteFilePath) {
		return null;
	}
	const parts = absoluteFilePath.split(":");
	if (parts.length >= 3) {
		return `${parts[parts.length - 2]}:${parts[parts.length - 1]}`;
	}
	return null; // Or handle cases where line and column are not found
}

export function getRootDirectoryAbsolutePath(absoluteFilePath) {
	try {
		const url = new URL(absoluteFilePath);
		const pathname = url.pathname;
		let pathSegments = pathname.split("/").filter(Boolean); // 获取路径段数组

		const relativePathSegments =
			ROOT_TO_THIS_FILE_PATH.split("/").filter(Boolean);
		// 移除 ROOT_TO_THIS_FILE_PATH 中文件名部分，只保留目录部分
		relativePathSegments.pop(); // 假设最后一个是文件名

		// 计算需要向上回溯的目录层级
		const upLevels = relativePathSegments.length;

		// 从 pathSegments 尾部移除相应数量的目录段，得到根目录的路径段
		pathSegments = pathSegments.slice(0, pathSegments.length - upLevels);

		const rootPath = "/" + pathSegments.join("/");
		return `${url.protocol}//${url.host}${rootPath}`;
	} catch (error) {
		debugError("Error parsing URL:", error);
		return null;
	}
}

export function getStackTracePath(location = 0) {
	const afterLocation = location + 2;
	const stack = new Error().stack;
	return extractPath(stack.split("\n")[afterLocation].trim());
}

export function extractPath(filePath) {
	if (!filePath) {
		return null; // 或者 "", 根据你的需求处理空输入
	}
	const match = filePath.match(/\((https?:\/\/[^\)]+)\)/);
	if (match && match[1]) {
		return match[1];
	}
	return null; // 或者 "", 如果没有找到匹配的路径
}

export function compareRelativePath(from, to) {
	// 1. 解析URL并提取路径，去除行号列号
	const fromPath = new URL(from).pathname.split(":")[0]; // 移除 ':行号:列号' 部分
	const toPath = new URL(to).pathname.split(":")[0];

	// 2. 分割路径
	const fromSegments = fromPath.split("/").filter(Boolean); // filter(Boolean) 移除空字符串
	const toSegments = toPath.split("/").filter(Boolean);

	// 3. 找出共同路径前缀的长度
	let commonPrefixLength = 0;
	while (
		commonPrefixLength < fromSegments.length &&
		commonPrefixLength < toSegments.length &&
		fromSegments[commonPrefixLength] === toSegments[commonPrefixLength]
	) {
		commonPrefixLength++;
	}

	// 4. 构建相对路径
	// const upLevels = fromSegments.length - commonPrefixLength; // 原始计算方式
	const upLevels = Math.max(0, fromSegments.length - commonPrefixLength - 1); // 修正后的计算方式
	const relativeSegments = [];

	// 添加向上返回的 '..'
	for (let i = 0; i < upLevels; i++) {
		relativeSegments.push("..");
	}

	// 添加目标路径中，除去共同前缀后的剩余部分
	for (let i = commonPrefixLength; i < toSegments.length; i++) {
		relativeSegments.push(toSegments[i]);
	}

	// 如果相对路径为空，表示在同一目录下，返回 './' 或者文件名
	if (relativeSegments.length === 0) {
		const fromFilename = fromSegments[fromSegments.length - 1];
		const toFilename = toSegments[toSegments.length - 1];
		if (fromFilename === toFilename) {
			return "./"; // 两个路径完全相同
		} else {
			return "./" + toFilename; // 同目录下，但文件名不同，返回 './文件名'
		}
	}

	return relativeSegments.join("/");
}
